%CHECKMISSINGNVIMAGE Confirms the exact ceiling on MAPLES-DR NV validation sample size.
%   validateAgainstMAPLESNV.m reports n=5 NV-positive test cases out of 6
%   that exist in MAPLES-DR's ground truth. This script identifies exactly
%   WHICH one is missing and why, rather than leaving that as an
%   unexplained gap: of the 6 genuinely NV-positive MAPLES-DR masks,
%   5 have a matching image already present in this project's downloaded
%   Messidor-2 set; one (20051202_51488_0400_PP) does not. That image
%   belongs to the ORIGINAL Messidor dataset, not the Messidor-2 subset
%   already downloaded here (Messidor-2's Kaggle mirror is a curated
%   subset, not a superset, of the full Messidor collection) -- obtaining
%   it requires a separate registration/access request through Messidor's
%   own distribution process (not a Kaggle download), which is an external
%   human action outside what this session can complete. n=5 is therefore
%   the genuine current ceiling on this validation's sample size, not a
%   code limitation -- documented here precisely rather than left as an
%   unexplained "n=5" with no account of what it would take to do better.
setupPathsRoot = fileparts(mfilename('fullpath'));
maplesDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'maples_dr', 'MAPLES-DR');
imgDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'messidor2', 'IMAGES');
nvDirs = {fullfile(maplesDir, 'train', 'Neovascularization'), fullfile(maplesDir, 'test', 'Neovascularization')};
for d = 1:numel(nvDirs)
    listing = dir(fullfile(nvDirs{d}, '*.png'));
    for i = 1:numel(listing)
        m = imread(fullfile(nvDirs{d}, listing(i).name)) > 0;
        if any(m(:))
            [~, baseName, ~] = fileparts(listing(i).name);
            imgPath = fullfile(imgDir, [baseName '.png']);
            fprintf('%s positive, image exists: %d\n', baseName, isfile(imgPath));
        end
    end
end
