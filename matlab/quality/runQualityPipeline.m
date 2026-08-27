function summaryTable = runQualityPipeline(imageFolder, outputCsvPath, opts)
%RUNQUALITYPIPELINE Batch-run assessFundusQuality over a folder of images.
%   SUMMARY = RUNQUALITYPIPELINE(IMAGEFOLDER) processes every .png/.jpg/.jpeg
%   in IMAGEFOLDER, prints a pass/borderline/reject tally (the same "look at
%   it before you trust it" sanity check training/README.md asks for on the
%   Python side), and returns a table with one row per image.
%
%   SUMMARY = RUNQUALITYPIPELINE(IMAGEFOLDER, OUTPUTCSVPATH) also writes the
%   table to CSV.
%
%   SUMMARY = RUNQUALITYPIPELINE(IMAGEFOLDER, OUTPUTCSVPATH, OPTS) uses a
%   custom threshold config instead of defaultQualityConfig().
%
%   Example (against the APTOS images already present for the Python side):
%       summary = runQualityPipeline('../../training/data/aptos2019/train_images', ...
%           'aptos_quality_report.csv');

if nargin < 2
    outputCsvPath = '';
end
if nargin < 3 || isempty(opts)
    opts = defaultQualityConfig();
end

exts = {'*.png', '*.jpg', '*.jpeg'};
files = [];
for i = 1:numel(exts)
    files = [files; dir(fullfile(imageFolder, exts{i}))]; %#ok<AGROW>
end

n = numel(files);
if n == 0
    error('runQualityPipeline:noImages', 'No .png/.jpg/.jpeg images found in %s', imageFolder);
end

filenames = strings(n, 1);
verdicts = strings(n, 1);
focusScores = nan(n, 1);
meanIntensities = nan(n, 1);
uniformityCVs = nan(n, 1);
fovFractions = nan(n, 1);
reasonsJoined = strings(n, 1);

fprintf('Assessing %d images in %s ...\n', n, imageFolder);
tic;
for i = 1:n
    path = fullfile(files(i).folder, files(i).name);
    try
        img = imread(path);
        r = assessFundusQuality(img, opts);
        filenames(i) = string(files(i).name);
        verdicts(i) = string(r.verdict);
        focusScores(i) = r.focusScore;
        meanIntensities(i) = r.illumination.meanIntensity;
        uniformityCVs(i) = r.illumination.uniformityCV;
        fovFractions(i) = r.fov.areaFraction;
        reasonsJoined(i) = strjoin(string(r.reasons), '|');
    catch ME
        filenames(i) = string(files(i).name);
        verdicts(i) = "error";
        reasonsJoined(i) = string(ME.message);
    end

    if mod(i, 200) == 0 || i == n
        fprintf('  %d/%d (%.1f s elapsed)\n', i, n, toc);
    end
end

summaryTable = table(filenames, verdicts, focusScores, meanIntensities, ...
    uniformityCVs, fovFractions, reasonsJoined, ...
    'VariableNames', {'filename', 'verdict', 'focusScore', 'meanIntensity', ...
    'uniformityCV', 'fovAreaFraction', 'reasons'});

fprintf('\nVerdict distribution:\n');
summary(categorical(verdicts))

if ~isempty(outputCsvPath)
    writetable(summaryTable, outputCsvPath);
    fprintf('Wrote %s\n', outputCsvPath);
end

end
