% Does IDRiD have a dominant left/right convention for fovea position
% relative to the OD in image coordinates? If so, that's exploitable (with
% appropriate caveats) instead of the current "search both sides, pick the
% darker" heuristic that validateAgainstIDRiD.m showed failing ~45% of the time.
setupPathsRoot = fileparts(mfilename('fullpath'));
idridDir = fullfile(setupPathsRoot, '..', '..', 'training', 'data', 'idrid');
odCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '1. Optic Disc Center Location', 'a. IDRiD_OD_Center_Training Set_Markups.csv');
foveaCsvPath = fullfile(idridDir, 'C. Localization', '2. Groundtruths', '2. Fovea Center Location', 'IDRiD_Fovea_Center_Training Set_Markups.csv');

odTable = readtable(odCsvPath);
foveaTable = readtable(foveaCsvPath);

n = height(odTable);
dx = nan(n, 1);
for k = 1:n
    row = strcmp(foveaTable.ImageNo, odTable.ImageNo{k});
    if any(row)
        dx(k) = foveaTable.X_Coordinate(row) - odTable.X_Coordinate(k);
    end
end
valid = ~isnan(dx);
fprintf('n=%d valid=%d\n', n, nnz(valid));
fprintf('fovea to the RIGHT of OD (dx>0): %d (%.1f%%)\n', nnz(dx(valid) > 0), 100 * mean(dx(valid) > 0));
fprintf('fovea to the LEFT of OD (dx<0):  %d (%.1f%%)\n', nnz(dx(valid) < 0), 100 * mean(dx(valid) < 0));
fprintf('dx: mean=%.1f median=%.1f min=%.1f max=%.1f\n', mean(dx(valid)), median(dx(valid)), min(dx(valid)), max(dx(valid)));
