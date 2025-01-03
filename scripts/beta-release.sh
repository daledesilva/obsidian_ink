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
git tag "$1-beta"
git push origin --tags 

# Communication
echo "*****************************"
echo "Beta draft process initiated!"
echo "-----------------------------"
echo "Next Steps:"
echo "1. Add changes to release text."
echo "2. Tag issues."
echo "3. Tag issue contributers."
echo "4. Update the manifest-BETA version in main."
echo "*****************************"
