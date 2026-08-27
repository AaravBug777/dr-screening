function feats = extractRadiomicFeatures(greenChannel, lesionMask, opts)
%EXTRACTRADIOMICFEATURES Medical Imaging Toolbox texture features over the lesion ROI.
%   FEATS = EXTRACTRADIOMICFEATURES(GREENCHANNEL, LESIONMASK) wraps
%   Medical Imaging Toolbox's `radiomics` object around a 2-D fundus image
%   and a lesion candidate mask, and returns a fixed-length numeric row
%   vector of GLCM texture features summarizing lesion-region heterogeneity
%   -- a genuinely different signal from the plain per-lesion-type PIXEL
%   COUNTS extractStructuralFeatures.m already collects (this measures how
%   TEXTURALLY COMPLEX the flagged regions are, not how many there are).
%
%   Why this closes a real gap, not a contrived one: `radiomics` accepts a
%   plain 2-D numeric matrix + ROI mask directly (no DICOM/medicalImage
%   wrapper required -- confirmed via `help radiomics`), unlike
%   `medicalImage`, which segmentation/README.md already tried and found
%   genuinely inapplicable to a non-DICOM fundus JPEG (requires a real
%   dicominfo-sourced metadata struct). This is a different Medical
%   Imaging Toolbox entry point that fits 2-D fundus data as-is.
%
%   GREENCHANNEL: 2-D double/single image (the illumination-normalized
%   green channel used elsewhere in segmentation/ -- highest lesion
%   contrast of the three RGB channels for fundus images).
%   LESIONMASK: logical mask, the union of MA/exudate/hemorrhage candidate
%   pixels (segmentation/'s own detectors) -- the ROI radiomics computes
%   texture over. An empty/all-false mask (a genuinely lesion-free image)
%   returns NaN features, handled by the caller (grading/'s feature table
%   already tolerates NaN rows the same way it tolerates a failed
%   detector -- see trainStructuralReferableNet.m).
%
%   FEATS is a 1x6 vector, one value per named column below, pulled by
%   EXACT column name (not substring matching -- `textureFeatures`'s table
%   has 51 columns and several names are substrings of each other, e.g.
%   'Correlation' is also a substring of 'AutoCorrelation' and
%   'InformationCorrelation1/2'; matching loosely picked the wrong column
%   silently during development, caught by printing the real column names
%   before trusting this):
%   [ContrastAveraged2D, CorrelationAveraged2D, AngularSecondMomentAveraged2D
%    (energy), InverseDifferenceMomentAveraged2D (homogeneity),
%    JointEntropyAveraged2D, DifferenceEntropyAveraged2D]

if nargin < 3 || isempty(opts)
    opts = defaultSegmentationConfig();
end

colNames = {'ContrastAveraged2D', 'CorrelationAveraged2D', 'AngularSecondMomentAveraged2D', ...
    'InverseDifferenceMomentAveraged2D', 'JointEntropyAveraged2D', 'DifferenceEntropyAveraged2D'};
feats = nan(1, numel(colNames));

if ~any(lesionMask(:))
    return
end

try
    % Resegment=false, explicit FixedBinNumber discretization: the default
    % Resegment=true collapsed EVERY texture feature to a degenerate
    % constant (JointEntropy=0, JointMaximum=1, i.e. all co-occurrence
    % mass in one bin) regardless of real input variation -- confirmed by
    % feeding it four genuinely different real fundus images and getting
    % byte-identical output every time, on both the lesion mask AND the
    % whole FOV mask (so it wasn't specific to a fragmented ROI). Root
    % cause: default resegmentation assumes an intensity convention (CT
    % Hounsfield-unit-like) this project's [0,1]-scaled fundus data
    % doesn't match, functionally clipping almost everything into one bin.
    % Disabling it and forcing an explicit 32-bin discretization produces
    % real, varying values -- verified across the same four images before
    % trusting this.
    R = radiomics(double(greenChannel), double(lesionMask), ...
        Resegment = false, Discretize = true, ...
        DiscreteMethod = "FixedBinNumber", DiscreteBinSizeOrBinNumber = 32);
    T = textureFeatures(R, Type = "GLCM");
catch err
    warning('extractRadiomicFeatures:radiomicsFailed', ...
        'radiomics texture extraction failed (%s) -- returning NaN features for this image, same fallback the count-based features already use for a failed detector.', err.message);
    return
end

for i = 1:numel(colNames)
    if ismember(colNames{i}, T.Properties.VariableNames)
        vals = T{:, colNames{i}};
        vals = vals(isfinite(vals));
        if ~isempty(vals)
            feats(i) = mean(vals); % averages across ROI labels if textureFeatures ever returns more than one row
        end
    end
end

end
