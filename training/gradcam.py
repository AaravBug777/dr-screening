"""
Grad-CAM for the DR classifier.

This is the explainability piece: given a fundus image and a predicted class,
produces a heatmap over the regions (microaneurysms, hemorrhages, exudates)
that drove the model's decision. Judges/clinicians can sanity-check the model
isn't just keying off image borders or artifacts.

Usage as a script (quick visual check on one image):
    python gradcam.py --image path/to/fundus.png

Usage as a module (used by the backend for the live app):
    from gradcam import GradCAM
    cam = GradCAM(model)
    heatmap, pred_class, probs = cam.generate(image_tensor)
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)  # Windows fix: avoid OpenCV/PyTorch DLL init order conflict

import argparse
import numpy as np
import torch
import torch.nn.functional as F

import config
from dataset import ben_graham_preprocess, get_transforms


class GradCAM:
    def __init__(self, model, target_layer=None):
        """
        model: a timm model (e.g. efficientnet_b3) already loaded with trained weights, in eval mode.
        target_layer: the conv layer to hook. If None, auto-picks the last conv
        block, which works for EfficientNet/ResNet family models from timm.
        """
        self.model = model
        self.model.eval()
        self.gradients = None
        self.activations = None

        if target_layer is None:
            target_layer = self._find_last_conv_layer()
        self.target_layer = target_layer

        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_full_backward_hook(self._save_gradient)

    def _find_last_conv_layer(self):
        last_conv = None
        for module in self.model.modules():
            if isinstance(module, torch.nn.Conv2d):
                last_conv = module
        if last_conv is None:
            raise ValueError("No Conv2d layer found in model — pass target_layer explicitly.")
        return last_conv

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(self, image_tensor, class_idx=None, temperature=1.0):
        """
        image_tensor: preprocessed tensor, shape (1, 3, H, W), on the same device as model.
        class_idx: which class to explain. If None, uses the predicted class.
        temperature: divides logits before softmax (see config.py's
            REFERABLE_TEMPERATURE docstring for how this was fit -- a
            positive rescale, so it doesn't change which class is argmax,
            only how spread out/confident the reported probabilities are).
            Grad-CAM's own backward pass explains RAW logits regardless of
            temperature -- which region drove the decision isn't a function
            of a post-hoc probability calibration, only the returned probs
            (used for the on-screen bars and the referable decision) reflect it.
        Returns: heatmap (H, W) in [0,1], predicted class index, calibrated softmax probs.
        """
        logits = self.model(image_tensor)
        probs = F.softmax(logits / temperature, dim=1).detach().cpu().numpy()[0]

        if class_idx is None:
            class_idx = int(logits.argmax(dim=1).item())

        self.model.zero_grad()
        score = logits[0, class_idx]
        score.backward()

        gradients = self.gradients[0]      # (C, h, w)
        activations = self.activations[0]  # (C, h, w)
        weights = gradients.mean(dim=(1, 2))  # (C,)

        cam = torch.zeros(activations.shape[1:], dtype=torch.float32, device=activations.device)
        for i, w in enumerate(weights):
            cam += w * activations[i]

        cam = F.relu(cam)
        cam = cam - cam.min()
        if cam.max() > 0:
            cam = cam / cam.max()

        cam = cam.cpu().numpy()
        cam = cv2.resize(cam, (image_tensor.shape[3], image_tensor.shape[2]))
        return cam, class_idx, probs


def overlay_heatmap(original_rgb_uint8, cam, alpha=0.4):
    """Blend a Grad-CAM heatmap onto the original image for display."""
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    overlay = cv2.addWeighted(original_rgb_uint8, 1 - alpha, heatmap, alpha, 0)
    return overlay


def load_trained_model(checkpoint_path=config.CHECKPOINT_PATH, device="cpu"):
    import timm
    ckpt = torch.load(checkpoint_path, map_location=device)
    model = timm.create_model(ckpt["model_name"], pretrained=False, num_classes=config.NUM_CLASSES)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    return model


def run_on_image(image_path, checkpoint_path=config.CHECKPOINT_PATH, device="cpu"):
    model = load_trained_model(checkpoint_path, device)
    cam_tool = GradCAM(model)

    img = cv2.imread(image_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    processed = ben_graham_preprocess(img)

    transform = get_transforms(train=False)
    tensor = transform(image=processed)["image"].unsqueeze(0).to(device)
    tensor.requires_grad_(False)

    cam, pred_class, probs = cam_tool.generate(tensor)

    display_img = cv2.resize(processed, (config.IMG_SIZE, config.IMG_SIZE))
    overlay = overlay_heatmap(display_img, cam)

    return {
        "predicted_class": pred_class,
        "predicted_label": config.CLASS_NAMES[pred_class],
        "probabilities": probs.tolist(),
        "recommendation": config.RECOMMENDATIONS[pred_class],
        "overlay_image": overlay,       # numpy array, RGB
        "preprocessed_image": display_img,  # numpy array, RGB
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, help="Path to a fundus image")
    parser.add_argument("--checkpoint", default=config.CHECKPOINT_PATH)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    result = run_on_image(args.image, args.checkpoint, device)

    print(f"Prediction: {result['predicted_label']} (class {result['predicted_class']})")
    print(f"Probabilities: {result['probabilities']}")
    print(f"Recommendation: {result['recommendation']}")

    cv2.imwrite("gradcam_overlay.png", cv2.cvtColor(result["overlay_image"], cv2.COLOR_RGB2BGR))
    print("Saved overlay to gradcam_overlay.png")
