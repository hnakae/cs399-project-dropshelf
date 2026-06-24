# CS-399-Project <hnakae@uoregon.edu>

## How the Course Moves

This course uses a five-sprint sequence. Each sprint adds project evidence and gives you another opportunity to practice the engineering cycle: Define, Generate, Analyze, Revise, Verify, and Explain.

Sprint 1: definition artifacts such as project vision, requirements, architecture, and repository setup
Sprint 2: a working prototype that demonstrates meaningful functionality
Sprint 3: persistence, integration, expanded features, and architecture revision
Sprint 4: testing evidence, verification notes, refactoring, and maintainability improvements
Sprint 5: review evidence, final demonstration, repository evidence, and engineering communication

## Sprint-1-Target

By the end of Sprint 1, your project evidence should include: README.md project-vision.md requirements.md architecture.md a private GitHub repository early commits that show your project definition work

## Git Branches

Here are the key git branch commands:

Create a new branch:
git checkout -b new-branch-name

List all branches:
git branch          # local branches
git branch -a       # local + remote branches

Switch to an existing branch:
git checkout branch-name

Edit files, then stage and commit:
git add file1.txt file2.txt   # stage specific files
git commit -m "your commit message"

Push the branch to the remote repo:
git push -u origin branch-name

The -u flag sets up tracking so future pushes on that branch only need git push.