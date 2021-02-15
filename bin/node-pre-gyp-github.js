#!/usr/bin/env node

const Module = require('../index.js');
const Program = require('commander');

Program
	.command('publish [options]')
	.description('publishes the contents of .\\build\\stage\\{version} to the current version\'s GitHub release')
	.option("-r, --release", "publish immediately, do not create draft")
	.option("-s, --silent", "turns verbose messages off")
	.action(function(cmd, options){
		const opts = {};
		opts.draft = options.release ? false : true;
		opts.verbose = options.silent ? false : true;
		Module.publish(opts);
	});

Program
	.command('help','',{isDefault: true, noHelp: true})
	.action(function() {
		console.log();
		console.log('Usage: node-pre-gyp-github publish');
		console.log();
		console.log('publishes the contents of .\\build\\stage\\{version} to the current version\'s GitHub release');
	});

Program.parse(process.argv);

if (!Program.args.length) {
	Program.help();
}
