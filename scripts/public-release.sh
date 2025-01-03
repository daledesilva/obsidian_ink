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

# Communication
echo "*******************************"
echo "Public draft process initiated!"
echo "-------------------------------"
echo "Next Steps:"
echo "1. Copy release text from beta releases."
echo "1. Add new changes."
echo "2. Tag newly addressed issues."
echo "3. Tag issue contributers."
echo "4. Update the manifest version in main."
echo "*******************************"