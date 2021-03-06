//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var Promise    = require('bluebird');

var transformField = require('./transformField.js');
var transformModel = require('./transformModel.js');
var transformForm  = require('./transformForm.js');
var transformQuery = require('./transformQuery.js');

var generateOutline = require('.//generateOutline');

var semlog     = require('semlog');
var log        = semlog.log;


/**
 * Generates the wikitext from the JSON model
 * Each Site Type has its own parser (e.g. transformField.js) and its own template (field.wikitext)
 * Uses the handlebars.js template engine.
 *
 * @param settings
 * @param registry
 * @returns {{}}
 */
exports.exec = function(settings, registry) {
    'use strict';

    return new Promise(function(resolve) {

        //////////////////////////////////////////
        // Variables                            //
        //////////////////////////////////////////

        /**
         * Generated wiki pages
         * @type {{}}
         */
        var generated = {};

        var page;
        var pageName;

        // Reset statistics
        registry.statistics.outputStats = {
            property: 0,
            category: 0,
            form: 0,
            template: 0,
            page: 0,
            total: 0
        };

        //////////////////////////////////////////
        // Parse the Model                      //
        //////////////////////////////////////////

        // Get Fields
        exports.callParser(settings, transformField, registry.expandedField, registry, generated);

        // Get Models
        exports.callParser(settings, transformModel, registry.expandedModel, registry, generated);

        // Get Forms
        exports.callParser(settings, transformForm, registry.expandedForm, registry, generated);


        //////////////////////////////////////////
        // Parse Queries                        //
        //////////////////////////////////////////

        exports.callParser(settings, transformQuery, registry.smw_query, registry, generated);


        //////////////////////////////////////////
        // MOBO SPECIFIC PAGES                  //
        //////////////////////////////////////////

        // If the HeaderTabs Extension is activated, create a HeaderTabs Helper Template
        if (settings.headerTabs) {
            generated['template:HeaderTabs'] = '<headertabs />';
            registry.statistics.outputStats.template += 1;
            registry.statistics.outputStats.total += 1;
        }

        // Subobject and Superobject helper-properties
        // Used to make querying simpler. See
        generated['property:subobject'] = 'This is an attribute of the datatype [[Has type::Page]]';
        generated['property:superobject'] = 'This is an attribute of the datatype [[Has type::Page]]';
        registry.statistics.outputStats.template += 2;
        registry.statistics.outputStats.total += 2;


        // Mobo model outline
        if (settings.uploadOutline) {
            var outlineUrl = 'User:' + settings.mw_username + '/outline';
            generated[outlineUrl] = generateOutline.exec(settings, registry);
        }

        //////////////////////////////////////////
        // Parse MediaWiki Categories            //
        //////////////////////////////////////////

        // Get / overwrite MediaWiki Templates
        for (var categoryName in registry.mw_category) {
            var category = registry.mw_category[categoryName];
            var categoryPageName = 'category:' + categoryName.replace('.wikitext', '');
            categoryPageName = categoryPageName.split('---').join('/');

            if (generated[categoryPageName] && settings.verbose) {
                log('[D] Overwriting Category: ' + categoryName + '');
            }

            generated[categoryPageName] = category;

            registry.statistics.outputStats.category += 1;
            registry.statistics.outputStats.total += 1;
        }


        //////////////////////////////////////////
        // Parse MediaWiki Templates            //
        //////////////////////////////////////////

        // Get / overwrite MediaWiki Templates
        for (var templateName in registry.smw_template) {
            var template = registry.smw_template[templateName];
            var templatePageName = 'template:' + templateName.replace('.wikitext', '');
            templatePageName = templatePageName.split('---').join('/');

            if (generated[templatePageName] && settings.verbose) {
                log('[D] Overwriting Template:' + templateName + '');
            }

            generated[templatePageName] = template;

            registry.statistics.outputStats.template += 1;
            registry.statistics.outputStats.total += 1;
        }

        //////////////////////////////////////////
        // Post-Processing MediaWiki pages      //
        //////////////////////////////////////////

        // String Substitutions
        for (pageName in registry.smw_page) {

            page = registry.smw_page[pageName];
            var newPageName = pageName.replace('.wikitext', '');
            newPageName = newPageName.split('___').join(':');   // Namespaces
            newPageName = newPageName.split('---').join('/');   // Subpages

            if (generated[newPageName]) {
                log('[i] Overwriting Site ' + pageName + '');
                generated[newPageName] = page;
            } else {
                generated[newPageName] = page;
            }

            registry.statistics.outputStats.page += 1;
            registry.statistics.outputStats.total += 1;
        }

        // Prepend a "generated by mobo" notion to all generated pages
        if (settings.generatedByMobo) {
            for (pageName in generated) {
                if (pageName.indexOf('MediaWiki') === -1) { // Skip pages from MediaWiki namespace
                    generated[pageName] = settings.generatedByMoboText + generated[pageName];
                }
            }
        }

        registry.generated = generated;

        if (settings.displayTodos) {
            log('--------------------------------------------------------------------------------');
        } else {
            log('--------------------------------------------------------------------------------', true);
        }

        resolve(registry);

    });

};

/**
 * Parses a specific Model Type from JSON Schema to WikiText
 *
 * Uses generator sub-modules
 * Escapes filenames
 * The Incoming datastructure of the generator is identical to the registry object
 * with the difference that only the created pages are returned.
 * Those will be converted to the flat generated object structure which has only pagenames as keys
 *
 * @param generator
 * @param data
 * @param settings
 * @param registry
 * @param generated
 */
exports.callParser = function(settings, generator, data, registry, generated) {
    'use strict';

    for (var name in data) {

        var obj = data[name];

        if (!obj || obj === '') {
            log('[W] File ' + name + ' is empty, will not be parsed!');
        } else {

            // Display to-do entries
            if (obj.todo) {
                var msg = '[TODO] ' + obj.$path + ': ' + obj.todo;
                if (settings.displayTodos) {
                    log(msg);
                } else {
                    log(msg, true); // If they should not be displayed, log them silently
                }
            }

            // Execute the generator
            var output = generator.exec(settings, obj, name, registry);

            // Iterate over the generated pages, do escaping and statistics
            for (var outputType in output) {

                for (var pageName in output[outputType]) {

                    var escapedName = pageName.replace('.', '-');
                    var fileName = outputType + ':' + escapedName;
                    generated[fileName] = output[outputType][pageName];
                    registry.statistics.outputStats[outputType] += 1;
                    registry.statistics.outputStats.total += 1;
                }
            }
        }
    }

    return generated;

};
