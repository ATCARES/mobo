//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var fs                = require('fs-extra');
var path              = require('path');
var Promise           = require('bluebird');
var NodeMW            = require('nodemw');

var readProject       = require('./../input/readProject');
var uploadExportFiles = require('./../output/uploadExportFiles');
var moboUtil          = require('./../util/moboUtil');
var log               = moboUtil.log;

//////////////////////////////////////////
// Global variables                     //
//////////////////////////////////////////

exports.uploadMap = {};
exports.fileMap = {};

/** Imported pages counter */
exports.counter = 0;

exports.total = 0;

//////////////////////////////////////////
// CORE FUNCTIONS                       //
//////////////////////////////////////////

/**
 * Looks for a _generated.json file and writes all containing contents to files
 *
 * @param {object}  settings
 * @param {string}  dirName        Directoryname within the project /import/ folder
 */
exports.exec = function(settings, dirName) {

    'use strict';

    exports.uploadMap = {};
    exports.fileMap = {};
    exports.settings = settings;

    // Read directory content (using promises)
    readProject.read(path.join(settings.cwd, '/import/' + dirName), dirName).then(function(contents) {

        log(' [i] Read ' + Object.keys(contents).length + ' files from directory: /import/' + dirName);


        //////////////////////////////////////////
        // Processing Wikitext pages            //
        //////////////////////////////////////////

        for (var name in contents) {

            var content = contents[name];
            exports.fileMap[name] = content;

            // Handle plain wikitext files
            if (name.indexOf('.wikitext') > -1) {
                var pageName = name.split('.wikitext').join('');
                pageName = pageName.split('___').join(':');   // Namespaces
                pageName = pageName.split('---').join('/');   // Subpages
                exports.uploadMap[pageName] = content;
                exports.total += 1;
            }
        }


        //////////////////////////////////////////
        // Programmatic data import             //
        //////////////////////////////////////////

        if (exports.fileMap['import.js']) {

            log(' [i] import.js detected -> using programmatic importing');

            // Programmatic import is asynchronous with a callback function
            // This is in order to support async actions within the import.js script
            exports.programmaticImport(exports.fileMap, dirName, function(err, importedPages) {

                // Add programmatically imported pages to the upload map
                for (var importedPageName in importedPages) {
                    exports.uploadMap[importedPageName] = importedPages[importedPageName];
                }

                exports.upload(exports.settings, exports.uploadMap);

            });

        } else {
            exports.upload(exports.settings, exports.uploadMap);
        }

    }, function(err) {
        log(err);
    }).catch(function(e) {
        log(' [E] Importer aborted due to errors when reading / processing the import files');
        log(e);
    });


};

/**
 * Upload the uploadMap to the remote wiki
 *
 * @param {{}} settings
 * @param {{}} uploadMap
 */
exports.upload = function(settings, uploadMap) {

    if (Object.keys(uploadMap).length === 0) {
        log(' [i] No pages to upload');

    } else {
        log(' [i] Uploading ' + Object.keys(uploadMap).length + ' pages');

        // Load and configure MediaWiki bot
        var botConfig = uploadExportFiles.getBotConfig(settings);
        exports.bot = new NodeMW(botConfig);

        // Log in
        exports.bot.logIn(botConfig.username, botConfig.password, function() {

            log(' [i] Bot logged in');

            for (var pageName in uploadMap) {
                var pageContent = uploadMap[pageName];

                // Upload to Wiki
                exports.bot.edit(pageName, pageContent, 'mobo import', function(err, response) {
                    if (err) {
                        log(' [E] mobo could not upload a page.');
                        log(err);
                    } else {
                        exports.counter += 1;

                        var change = '';
                        if (response['new'] === '') {
                            change = ' [+]';
                        } else if (response.newrevid) {
                            change = ' [C]';
                        }

                        log(' [U] (' + moboUtil.pad(exports.counter, 5) +
                            ' / ' + moboUtil.pad(exports.total, 5) + ') ' + response.title + change);
                    }
                });
            }
        });
    }
};

/**
 * Programmatically import files
 * The script must be provided as 'import.js' file
 * The data should be proved as .json files
 *
 * @param {{}}          fileMap
 * @param {string}      dirName
 * @param {function}    callback    callback function
 */
exports.programmaticImport = function(fileMap, dirName, callback) {

    // Delete the import.js from the map, since it will be loaded dynamically
    delete fileMap['import.js'];

    var importJs = path.join(exports.settings.cwd, '/import/' + dirName + '/import');
    var customImporter = require(importJs);

    // Load new importHelper
    var importHelper = require('./importHelper');


    // Try to read /_processed/_registry.json
    var registry = false;
    if (exports.settings && exports.settings.processedModelDir) {

        var registryPath = path.join(exports.settings.processedModelDir, '/_registry.json');

        if (fs.existsSync(registryPath)) {
            try {
                registry = require(registryPath);
            } catch (e) {
                log(' [E] Could not parse /_processed/_registry.json!');
                log(e);
            }
        }
    }

    try {
        customImporter.exec(fileMap, importHelper, registry, function(err, data) {

            if (!err) {
                return callback(false, data);
            } else {
                log(' [E] ' + importJs + ' crashed asyncronously');
                log(err);
                return callback(err, {});
            }

        });
    } catch (e) {
        log(' [E] ' + importJs + ' crashed synchronously');
        log(e);
        return callback(e, {});
    }

};