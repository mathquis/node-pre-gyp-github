"use strict";

const Path      = require('path');
const File      = require('fs');
const Mime      = require('mime-types');
const {Octokit} = require('@octokit/rest');

async function publish(options) {
    options || (options = {})

    const verbose = !!options.verbose

    function log(message) {
      console.log(message)
    }

    function debug(message) {
      if ( verbose ) console.log(`[DEBUG] ${message}`)
    }

    const stageDir = Path.resolve(process.cwd(), './build/stage')

    // Validate token
    const token = process.env['NODE_PRE_GYP_GITHUB_TOKEN']
    if ( !token ) {
      throw new Error('NODE_PRE_GYP_GITHUB_TOKEN environment variable not found')
    }

    // Read package.json
    let metadata
    try {
      const packagePath = Path.resolve(process.cwd(), './package.json')
      const content = await File.promises.readFile(packagePath)
      metadata = JSON.parse(content)
    } catch (err) {
      throw new Error(`Unable to read package.json (${err.message})`)
    }

    // Validate repository
    const {repository} = metadata
    if ( !repository || !repository.url ) {
      throw new Error('Missing repository.url in package.json');
    }

    const match = repository.url.match(/https?:\/\/([^\/]+)\/(.*)(?=\.git)/i);
    if( !match ) {
      throw new Error('A correctly formatted GitHub repository.url was not found within package.json');
    }
    const [, repositoryHost, repositoryUri] = match;
    const [owner, repo] = repositoryUri.split('/');

    // Validate binary
    const hostPrefix = `https://${repositoryHost}/${owner}/${repo}/releases/download/`;

    const {binary} = metadata
    if ( !binary || !binary.host ) {
      throw new Error('Missing binary.host in package.json');
    }
    if ( hostPrefix !== binary.host ) {
      throw new Error(`Invalid binary.host: Should be ${hostPrefix}`)
    }

    // Validate remote path
    if ( !binary.remote_path ) {
      throw new Error('Missing binary.remote_path')
    }

    const tagName = binary.remote_path.replace(/\{version\}/g, metadata.version);
    const tagDir = Path.join(stageDir, tagName);

    // Github API client
    const client = new Octokit({
      auth: token,
      baseUrl: `https://api.${repositoryHost}`
    })

    const {data: releases} = await client.repos.listReleases({
      owner, repo
    })

    let release = releases.find(release => release.tag_name === tagName)

    // Create a release if none found
    if( !release ) {
      release = await client.repos.createRelease( {
        'host': repositoryHost,
        'owner': owner,
        'repo': repo,
        'tag_name': metadata.version,
        'target_commitish': 'master',
        'name': 'v' + metadata.version,
        'body': `$[metadata.name} ${metadata.version}`,
        'draft': !!options.draft,
        'prerelease': false
      });
    }

    // List stage dir assets
    const files = await File.promises.readdir(tagDir)

    if( files.length === 0 ) {
      throw new Error('No files found within the stage directory: ' + tagDir);
    }

    // Upload assets to Github
    await files.reduce(async (p, file) => {
      await p

      if( release && release.assets ) {
        const asset = release.assets.find(asset => asset.name === file)
        if( asset ) {
          // TODO: Should be a warning
          log("Staged file " + file + " found but it already exists in release " + release.tag_name + ". If you would like to replace it, you must first manually delete it within GitHub.");
          return;
        }
      }

      const fileName    = file
      const filePath    = Path.resolve(tagDir, file)
      const fileContent = await File.promises.readFile(filePath)

      log("Staged file " + file + " found. Proceeding to upload it.");
      await client.repos.uploadReleaseAsset({
        url: release.upload_url,
        owner: owner,
        id: release.id,
        repo: repo,
        name: fileName,
        data: fileContent,
        contentType: Mime.contentType(fileName) || 'application/octet-stream',
        contentLength: fileContent.length
      })

      log('Staged file ' + fileName + ' saved to ' + owner + '/' +  repo + ' release ' + release.tag_name + ' successfully.');
    }, Promise.resolve());

    log('Done')
}

module.exports = {publish};
