function setupPaths()
%SETUPPATHS Add this project's MATLAB folders to the path.
%   Run once per session from the matlab/ directory (or anywhere, since this
%   file locates itself via mfilename('fullpath')).
%
%   Usage:
%       setupPaths
%       report = assessFundusQuality('some_image.png');

root = fileparts(mfilename('fullpath'));

folders = {'quality', 'segmentation', 'simulink', 'common', 'tests', 'grading'};
for i = 1:numel(folders)
    f = fullfile(root, folders{i});
    if isfolder(f)
        addpath(f);
    end
end

fprintf('Netra MATLAB paths added (root: %s)\n', root);

end
