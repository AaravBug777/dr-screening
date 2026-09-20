% Extends the candidate-refinement classifier design validated for
% microaneurysms (trainCandidateRefinementClassifier.m) to the other two
% lesion types with the same documented weak point (strong recall, weak
% precision): hard exudates and hemorrhages. Mechanical extension via
% trainLesionCandidateClassifier.m (generic, parameterized by lesion
% type/detector/ground-truth location) -- not attempted in the same run as
% microaneurysms originally, per that script's own docstring, since doing
% all three at once would have tripled real compute without proving
% anything new about the method itself. Run together here in one MATLAB
% process (not two separate invocations) to respect the one-license-seat
% constraint this project works under.

setupPathsRoot = fileparts(mfilename('fullpath'));
run(fullfile(setupPathsRoot, '..', 'setupPaths.m'));

trainLesionCandidateClassifier('exudate', @detectHardExudates, 'EX', '3. Hard Exudates', 'Exudates');
trainLesionCandidateClassifier('hemorrhage', @detectHemorrhages, 'HE', '2. Haemorrhages', 'Hemorrhages');
