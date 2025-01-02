#!/bin/bash

# Remove any existing local tags not on the remote
git fetch --prune origin "+refs/tags/*:refs/tags/*"

# Delete local tag if it exists
git tag -d internal-test

# Delete remote tag if it exists
git push origin --delete internal-test

# Create new tag
git tag internal-test

# Push the new tag
git push origin --tags 