//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var moboSchema   = require('./../schema/moboSchema');
var semlog     = require('semlog');
var log        = semlog.log;
var _ = require('lodash');


//////////////////////////////////////////
// CORE FUNCTIONS                       //
//////////////////////////////////////////

/**
 * Helper Function that reads the current JSON Schema objects for validation
 * and generates a simple markdown document.
 * This is necessary since the JSON Schema objects are calculated in JavaScript, using inheritance.
 */
exports.writeSchemas = function() {
    'use strict';

    // Requirements are function specific, because this function is very rarely called at all
    var fs = require('fs-extra');
    var path = require('path');
    var settings = require('./../settings.json');

    var dir = path.resolve(process.cwd(), './_code/schemas');

    var schemaExports = [
        'field',
        'model',
        'form'
    ];

    var files = {};

    try {

        //////////////////////////////////////////
        // MOBO-MODEL SPECIFIC DOCUMENTATION    //
        //////////////////////////////////////////
        for (var i = 0; i < schemaExports.length; i++) {
            var type = schemaExports[i];
            var specificSchema = moboSchema[type + 'Schema'];
            var specificSchemaAdditions = moboSchema[type + 'SchemaAdditions'];
            files[schemaExports[i] + '-schema.md'] = exports.convertSchemaToTable(specificSchema, type);
            files[schemaExports[i] + '-schema-additions.md'] = exports.convertSchemaToTable(specificSchemaAdditions, type);
            files[schemaExports[i] + '-schema.json'] = '```json\n' + JSON.stringify(specificSchema, null, 4) + '\n```';
        }


        //////////////////////////////////////////
        // Global Schemas DOCUMENTATION         //
        //////////////////////////////////////////

        // Settings
        files['settings.md'] = exports.convertSchemaToTable(moboSchema.settingsSchema);

        // Default Settings
        files['default-settings.md'] = '```json\n' + JSON.stringify(settings, null, 4) + '\n```';

        // Mobo Schema Additions
        files['mobo-schema-additions.md'] = exports.convertSchemaToTable(moboSchema.moboJsonSchemaAdditions);
        files['mobo-schema.md'] = exports.convertSchemaToTable(moboSchema.moboJsonSchema);
        files['mobo-schema.json'] = '```json\n' + JSON.stringify(moboSchema.moboJsonSchema, null, 4) + '\n```';

        //jsonSchemaCoreRemovals
        files['mobo-schema-removals.md'] = '```json\n' + JSON.stringify(moboSchema.jsonSchemaCoreRemovals, null, 4) + '\n```';

        // Programmatic import example
        var importExample = fs.readFileSync(__dirname + '/../../examples/hardware/import/data/import.js');
        files['programmatic-import-example.md'] = '```javascript\n' + importExample + '\n```';

    } catch (e) {
        log('[E] Could not write schema documentation!');
        log(e);
    }

    for (var fileName in files) {
        var filePath = path.resolve(dir, './' + fileName);
        fs.outputFileSync(filePath, files[fileName]);
        log('[i] Written ' + filePath);
    }


    return files;
};

/**
 * Converts JSON Schema to a HTML table
 * This works recursively, so tables can be stacked into tables.
 * This will only make sense until a certain point of course.
 *
 * @param   {{}}        schema        JSON Schema
 * @param   {string}    [modelType]
 *
 * @returns {string}    HTML table
 */
exports.convertSchemaToTable = function(schema, modelType) {
    'use strict';

    var html = '';

    if (schema.properties) {

        var order = Object.keys(schema.properties).sort();
        var specificColumn = false;

        for (var i = 0; i < order.length; i++) {
            var prop = schema.properties[order[i]];
            if (prop.specific) {
                specificColumn = true;
            }
        }

        html += '<table class="schema-table" style="font-size: 0.75em;">\n   <thead>\n       <tr>\n';

        html += '           <th>ID</th>\n';
        html += '           <th>Description</th>\n';
        html += '       </tr>\n   </thead>\n   <tbody>\n';


        for (i = 0; i < order.length; i++) {
            var propertyName = order[i];
            var property = schema.properties[propertyName];

            if (propertyName === 'additionalProperties') {
                continue;
            }
            if (property.internal) {
                continue;
            }

            // Skip if the model type is declared in the "appliesNot" property
            if (property.appliesNot) {
                if (property.appliesNot.indexOf(modelType) > -1) {
                    continue;
                }
            }

            // If no specific property is given, assume 'domain'
            var specific = property.specific || 'domain';

            var typeHtml = '';

            // ID
            if (property.important) {
                propertyName = '<strong>' + propertyName + '</strong>';
            }

            if (property.unsupported) {
                propertyName = '<i class="fade">' + propertyName + '</i>';
            }

            // Types (tags)
            if (!property.type) {
                property.type = [];
            }
            if (!_.isArray(property.type)) {
                property.type = [property.type];
            }
            property.type.sort();
            for (var j = 0; j < property.type.length; j++) {
                var type = property.type[j];
                typeHtml += '<span class="schema-type schema-type-' + type + '">' + type + '</span>';
            }

            // Default
            var defaultValue = property['default'];
            if (defaultValue === undefined || defaultValue === null) {
                defaultValue = null;
            } else {
                defaultValue = JSON.stringify(defaultValue, null, 4);
            }

            var description = '';

            if (property.description) {
                description += '<p class="schema-description">' + property.description + '</p>';
            }
            if (typeHtml) {
                description += '<p class="schema-types"><strong>Type(s)</strong>: ' + typeHtml + '</p>';
            }
            if (specificColumn) {
                description += '<p class="schema-specifics"><strong>Specific to</strong>: <span class="schema-specific schema-specific-' + specific + '">' + specific + '</span></p>';
            }

            if (!_.isNull(defaultValue)) {
                description += '<p class="schema-default"><strong>Default</strong>: ' + defaultValue + '</p>';
            }

            if (property.link) {
                description += '<p class="schema-link"><strong>External Link</strong>: <a href="' + property.link + ' target="_blank">Documentation</a></p>';
            }

            if (property.enum) {
                description += '<p class="schema-enum"><strong>Valid entries</strong>: ' + property.enum.join(', ') + '</p>';
            }

            if (property.unsupported) {
                description += '<p class="schema-unsupported"><strong>Unsupported</strong>: This property is currently unsupported by the end-system.</p>';
            }

            if (property.example) {
                if (!_.isArray(property.example)) {
                    property.example = [property.example];
                }
                for (var p = 0; p < property.example.length; p++) {
                    var example = property.example[p];
                    description += '<p class="schema-example-header"><strong>Example</strong>:</p>';
                    description += '<pre class="schema-example"><code>' + example + '</code></pre>';
                }
            }

            if (property.properties) {
                description += '<p class="schema-subobject-header"><strong>Contains</strong>:</p>';
                description += exports.convertSchemaToTable(property);
            }

            html += '       <tr>\n';
            html += '           <td class="schema-propertyId">' + propertyName + '</td>\n';
            html += '           <td class="schema-description">' + description + '</td>\n';
            html += '       </tr>\n';

        }

        html += '   </tbody>\n</table>\n';
    }

    return html;
};
