#!/bin/bash

# Check if a version tag was provided
if [ -z "$1" ]; then
    echo "Error: Please provide a version tag"
    echo "eg: npm run ext-release <version-tag>"
    exit 1
fi

# Remove any existing local tags not on the remote
git fetch --prune origin "+refs/tags/*:refs/tags/*"

# Create and push the tag
git tag "$1"
git push origin --tags 