//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var _            = require('lodash');
var tv4          = require('tv4');
var Promise      = require('bluebird');

var moboSchema   = require('./../schema/moboSchema');
var semlog     = require('semlog');
var log        = semlog.log;


//////////////////////////////////////////
// CORE FUNCTIONS                       //
//////////////////////////////////////////

/**
 * Validates the development model before it is expanded
 *
 * @param {object}  registry mobo registry
 *
 * @returns {{}}
 */
exports.validateRegistry = function(registry) {
    'use strict';

    return new Promise(function(resolve) {

        var registryTypes = ['field', 'model', 'form'];

        // Iterate registry types
        for (var i = 0; i < registryTypes.length; i++) {
            var type = registryTypes[i];
            var elements = registry[type];
            var schema = moboSchema[type + 'Schema'];

            if (registry.settings && !registry.settings.allowAdditionalProperties) {
                schema.additionalProperties = false;
            }

            // Iterate each element of a type and validate it
            for (var elName in elements) {
                exports.validate(elements[elName], schema, type + '/' + elName);
            }
        }

        resolve(registry);
    });

};


/**
 * Validates the expanded mobo registry
 * Checks hard requirements and interdependencies
 *
 * @param {object}  registry mobo registry
 *
 * @returns {{}}
 */
exports.validateExpandedRegistry = function(registry) {
    'use strict';

    return new Promise(function(resolve) {

        var registryTypes = ['expandedField', 'expandedModel', 'expandedForm'];

        // Iterate registry types
        for (var i = 0; i < registryTypes.length; i++) {
            var type = registryTypes[i];
            var elements = registry[type];

            // Iterate each element of a type and validate it
            for (var elName in elements) {
                var obj = elements[elName];
                var id = obj.$path || obj.id || elName || '(unknown)';

                //////////////////////////////////////////
                // General Validation                   //
                //////////////////////////////////////////

                // @deprecated: title and type always have defaults
                //// Must have a title attribute
                //if (!obj.title) {
                //    log('[W] [JSON Structure] ' + id + '" has no title attribute!');
                //    obj.title = obj.id;
                //}
                //
                //// Must have a type attribute
                //if (!obj.type) {
                //    log('[W] [JSON Structure] ' + id + '" has no type attribute!');
                //}


                if (obj.type === 'array' && !obj.items) {
                    log('[E] If the type is "array", "items" must be set. > ' + obj.$path || obj.id);
                }

                if (obj.properties && obj.items) {
                    log('[E] An object cannot have both "properties" and "items"!');
                }

                // Checks if the object is actually used. Skip forms, since they are the entry points
                // -> Tree Shaking (or Forest Shaking to be more precise :) )
                if (type !== 'expandedForm' && !obj.$referenceCounter) {
                    log('[W] ' + id + ' is never used.');
                }


                //////////////////////////////////////////
                // Field specific Validation            //
                //////////////////////////////////////////

                if (type === 'expandedField') {

                    if (obj.default && obj.enum && obj.enum.indexOf(obj.default) < 0) {
                        log('[E] The default value "' + obj.default + '" is not part of the enum. > ' + obj.$path || obj.id);
                    }

                    if (obj.form && obj.format && obj.format !== 'Page') {
                        log ('[W] If a field defines "form", the format must be "page" (or omited)');
                    }

                    if (obj.sf_form && obj.sf_form['input type'] &&  obj.sf_form['input type'] === 'tokens' && !obj.items) {
                        log('[E] The tokens widget only makes sense with "type": "array". > ' + obj.$path || obj.id);
                    }
                }

                //////////////////////////////////////////
                // Model specific Validation            //
                //////////////////////////////////////////

                if (type === 'expandedModel') {

                    // If an requirement array is provided, check that all required properties do actually exist
                    if (obj.required) {
                        exports.arrayReferencesObjectKey(obj, 'required', 'properties');
                    }

                    // If an recommended array is provided, check that all required properties do actually exist
                    if (obj.recommended) {
                        exports.arrayReferencesObjectKey(obj, 'recommended', 'properties');
                    }

                    if (obj.smw_subobjectExtend && !obj.smw_subobject) {
                        log ('[W] ' + id + ': Property "smw_subobjectExtend" is applied on a model that defines no subobjects!');
                    }

                    if (obj.recommended && obj.required) {
                        var intersection = _.intersection(obj.recommended, obj.required);
                        if (intersection.length > 0) {
                            log ('[W] ' + id + ': "recommended" and "required" define the same fields: ' + intersection.join(', '));
                        }
                    }
                }

            }
        }

        resolve(registry);
    });

};

/**
 * Validate if the given objects array contains only values that existit in the given object
 *
 * @param {{}}      obj
 * @param {string}  arrayName
 * @param {string}  objName
 */
exports.arrayReferencesObjectKey = function(obj, arrayName, objName) {
    if (obj[objName]) {
        for (var j = 0; j < obj[arrayName].length; j++) {
            var requirement = obj[arrayName][j];
            if (!obj.properties[requirement] && requirement !== '*') {
                log('[W] ' + obj.$path + ' > "' + arrayName + '" > Non-existent property "' + obj.required[j] + '"!');
            }
        }
    } else {
        log('[W] ' + obj.$path + ' with "' + arrayName + '" has no "' + objName + '"');
    }
};


/**
 * Validates a settings object against mobos settings schema
 *
 * @param {object} settings
 *
 * @returns {Object} validation result
 */
exports.validateSettings = function(settings) {
    'use strict';
    return exports.validate(settings, moboSchema.settingsSchema, 'settings.json');
};

/**
 * Wrapper around a JSON Schema Validator, uses tv4
 * Uses promise pattern and mobo style error / warning messages
 *
 * @see https://www.npmjs.com/package/tv4)
 *
 * @param {object}  json
 * @param {object}  schema
 * @param {string}  name    only for error debugging
 *
 * @returns {object} result object
 */
exports.validate = function(json, schema, name) {
    'use strict';

    var id = json.$path || json.id || name || '(unknown)';

    // Validate with the tv4 JSON Schema Validator Library
    // Use multiple option to catch and report multiple errors in one json object
    var result = tv4.validateMultiple(json, schema);

    if (!result.valid || result.errors.length > 0) {
        for (var i = 0; i < result.errors.length; i++) {

            var error = result.errors[i];

            if (error.message === 'Additional properties not allowed') {
                log('[W] [JSON Structure] ' + id + ': Unsupported property ' + error.dataPath);
            } else {
                log('[E] [JSON Structure] ' + id + ': ' + error.message);
                log({
                    message: error.message,
                    dataPath: error.dataPath,
                    schemaPath: error.schemaPath,
                    params: error.params
                });
            }
        }
    }

    return result;
};
