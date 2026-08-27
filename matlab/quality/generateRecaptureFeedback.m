function feedback = generateRecaptureFeedback(reasons)
%GENERATERECAPTUREFEEDBACK Map failure/borderline reason codes to operator-facing guidance.
%   FEEDBACK = GENERATERECAPTUREFEEDBACK(REASONS) takes the cellstr of reason
%   codes produced by assessFundusQuality and returns a single human-readable
%   string aimed at the person operating a portable fundus camera at a rural
%   PHC — plain-language, actionable, no clinical jargon they'd need training
%   to interpret. This is the "recapture feedback" the SIH brief calls for.

messages = containers.Map();
messages('too_blurry') = 'Image is out of focus. Clean the camera lens, ask the patient to fixate on the target light without blinking, and recapture.';
messages('soft_focus') = 'Image is slightly soft/out of focus. Recapture if possible for a sharper image.';
messages('too_dark') = 'Image is too dark to grade. Increase flash brightness or reduce reflections from ambient light, and recapture.';
messages('underexposed') = 'Image is a little dark. Consider increasing flash brightness before the next capture.';
messages('too_bright') = 'Image is overexposed/washed out. Reduce flash brightness or reposition to avoid direct reflection, and recapture.';
messages('overexposed') = 'Image is a little bright/washed out. Consider reducing flash brightness before the next capture.';
messages('very_uneven_illumination') = 'Lighting is very uneven across the image (bright on one side, dark on the other). Recenter the camera on the pupil and recapture.';
messages('uneven_illumination') = 'Lighting is somewhat uneven. Try to keep the camera centered and steady during capture.';
messages('glare') = 'A bright reflection (glare) is visible on the image, likely off the cornea or lens. Adjust the camera angle slightly and recapture.';
messages('insufficient_field_of_view') = 'Too little of the retina is visible in this image. Move the camera closer or recheck alignment with the pupil, and recapture.';
messages('partial_field_of_view') = 'Only part of the retina is clearly visible. Recapture with the camera centered on the pupil for full field of view.';
messages('possible_fov_clipping') = 'The retinal field appears cropped at the image edge. Recapture making sure the full fundus circle is within frame.';
messages('off_center') = 'The retina is not centered in the frame. Recenter the camera on the pupil and recapture.';
messages('low_source_resolution') = 'This image is much lower resolution than a real fundus camera capture, which can produce an unreliable grade -- image compression/scaling artifacts can be mistaken for lesions. If this came from a camera, check its resolution/quality setting. If it was downloaded, screenshotted, or copied from somewhere else, use the original camera file instead.';

if isempty(reasons)
    feedback = '';
    return
end

lines = strings(0);
for i = 1:numel(reasons)
    code = reasons{i};
    if isKey(messages, code)
        lines(end + 1) = string(messages(code)); %#ok<AGROW>
    else
        lines(end + 1) = string(code); %#ok<AGROW>
    end
end

feedback = char(strjoin(unique(lines, 'stable'), ' '));

end
