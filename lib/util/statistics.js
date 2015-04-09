//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var fs          = require('fs-extra');
var path        = require('path');
var execSync    = require('child_process').execSync;
var _           = require('lodash');

var moboUtil    = require('./moboUtil');
var log         = moboUtil.log;


//////////////////////////////////////////
// CORE FUNCTIONS                       //
//////////////////////////////////////////

/**
 * Calculates statistics from the registry object
 * They will be displayed in the CLI and stored to the logfiles
 *
 * @param {{}} settings
 * @param {{}} registry
 */
exports.registryStatistics = function(settings, registry) {
    'use strict';

    exports.settings = settings;

    var s = registry.statistics; // Shortcut


    //////////////////////////////////////////
    // CALCULATING STATISTICS               //
    //////////////////////////////////////////

    s.inputStats = exports.calculateInputStatistics(registry);
    s.graphStats = exports.calculateGraphStatistics(registry);
    s.complexity = exports.calculateComplexity(registry);
    s.log = exports.calculateLogStatistics();
    s.git = exports.calculateGitStatistics();


    //////////////////////////////////////////
    // PRINT STATISTICS                     //
    //////////////////////////////////////////

    // INPUT STATISTICS
    exports.printStatistics(' IN:    ', {
        'Field': s.inputStats.field,
        'Model': s.inputStats.model,
        'Form': s.inputStats.form,
        'Template': s.inputStats.smw_template,
        'Query': s.inputStats.smw_query,
        'Page': s.inputStats.smw_page
    });

    // OUTPUT STATISTICS
    exports.printStatistics(' OUT:   ', {
        'Property': s.outputStats.property,
        'Template': s.outputStats.template,
        'Form': s.outputStats.form,
        'Category': s.outputStats.category,
        'Page': s.outputStats.page
    });

    // COMPLEXITY STATISTICS
    exports.printStatistics(' COMPL: ', {
        'DevM': moboUtil.prettyNumber(s.complexity.devModelSize),
        'ProcM': moboUtil.prettyNumber(s.complexity.processedModelSize) +
            ' (' + s.complexity.processedModelPercentage + '%)',
        'Final': moboUtil.prettyNumber(s.complexity.generatedSize) +
            ' (' + s.complexity.generatedPercentage + '%)'
    });

    // GRAPH STATISTICS
    if (settings.buildGraph) {
        exports.printStatistics(' GRAPH: ', {
            'Node': s.graphStats.nodes,
            'Edge': s.graphStats.edges
        });
    }

    return registry;
};

/**
 * Calculates the input stats, counted in files
 *
 * @param registry
 *
 * @returns {{}}
 */
exports.calculateInputStatistics = function(registry) {

    // in numbers of files
    var inputStats = {
        field: Object.keys(registry.field).length,
        model: Object.keys(registry.model).length,
        form: Object.keys(registry.form).length,
        smw_template: Object.keys(registry.smw_template).length,
        smw_query: Object.keys(registry.smw_query).length,
        smw_page: Object.keys(registry.smw_page).length
    };

    // Calculate total inputStats
    inputStats.total = 0;
    for (var categoryName in inputStats) {
        inputStats.total += inputStats[categoryName];
    }

    return inputStats;
};

/**
 * Calculates the graph stats, counted in number of nodes / edges
 *
 * @param registry
 *
 * @returns {{}}
 */
exports.calculateGraphStatistics = function(registry) {

    return {
        nodes: _.size(registry.graph.nodes) || 0,
        edges: _.size(registry.graph.edges) || 0
    };
};

/**
 * Calculates the project complexity, counted in characters
 *
 * @param registry
 *
 * @returns {{}}
 */
exports.calculateComplexity = function(registry) {

    // In number of characters
    var complexity = {
        devModelSize: registry.statistics.inputSize.total,
        processedModelSize: JSON.stringify({
            // Only count the expandedForms, since they already include the expanded fields and models
            expandedForm: registry.expandedForm,
            smw_template: registry.smw_template,
            smw_query: registry.smw_query,
            smw_page: registry.smw_page
        }).length,
        generatedSize: JSON.stringify(registry.generated).length
    };

    // Calculate the difference to the development model in percentage
    complexity.processedModelPercentage = Math.round(
        (complexity.processedModelSize / complexity.devModelSize) * 1000
    ) / 10;
    complexity.generatedPercentage = Math.round(
        (complexity.generatedSize / complexity.devModelSize) * 1000
    ) / 10;

    return complexity;
};

/**
 * Calculates the logging statistics, counted in number of log messages
 *
 * @returns {{}}
 */
exports.calculateLogStatistics = function() {

    var logHistory = moboUtil.getLogHistory();
    var logStats = {
        total: logHistory.length,
        warning: 0,
        error: 0,
        todo: 0
    };

    for (var i = 0; i < logHistory.length; i++) {
        var entry = logHistory[i];
        if (typeof entry === 'string') {
            if (entry.indexOf(' [E] ') > -1) {
                logStats.error += 1;
            } else if (entry.indexOf(' [W] ') > -1) {
                logStats.warning += 1;
            } else if (entry.indexOf(' [TODO] ') > -1) {
                logStats.todo += 1;
            }
        }
    }

    return logStats;
};

/**
 * Returns some git statistics / informations about the current revision
 *
 * @returns {{}}
 */
exports.calculateGitStatistics = function() {

    var git = {
        logMessage: '',
        shortHash: '',
        timestamp: ''
    };

    // Supported by Node.js >= 0.12
    if (execSync) {
        git.logMessage = execSync('git log -1 --pretty=%B').toString().trim();
        git.shortHash = execSync('git rev-parse --short HEAD').toString().trim();
        git.timestamp = execSync('git show -s --format=%ct').toString().trim();
    }

    return git;
};

/**
 * Prints a statistic object to the console output
 * @param prefix
 * @param statObj
 */
exports.printStatistics = function(prefix, statObj) {

    var print = prefix;
    var separator = ' | ';
    for (var key in statObj) {
        var value = statObj[key];
        print += value + ' ' + key + separator;
    }

    log(print.substring(0, print.length - separator.length)); // Omit last separator
    log('--------------------------------------------------------------------------------');
};

/**
 * Writes the statistics object to the logfile and a CSV history
 *
 * @param {{}}      statistics
 * @param {string}  directory
 */
exports.writeStatistics = function(statistics, directory) {

    // To Logobject / report
    log(statistics, true);

    // To CSV File (/_processed/_statistics.csv)
    var statisticsCsvPath = path.join(directory, '/_statistics.csv');
    var statisticsJsonPath = path.join(directory + '/_statistics.json');

    var header = [];
    var content = [];

    var statisticsSortedOrder = Object.keys(statistics).sort();

    // Convert the statistics object to two flattened arrays
    // They will be used to generate the csv file
    // Categories and subcategories will be sorted alphabetically
    for (var i = 0; i < statisticsSortedOrder.length; i++) {
        var statCategory = statisticsSortedOrder[i];
        var statSortedOrder = Object.keys(statistics[statCategory]).sort();

        for (var j = 0; j < statSortedOrder.length; j++) {
            var statName = statSortedOrder[j];
            var statValue = statistics[statCategory][statName];

            // If it is a number, use ',' as the floating point
            if (!isNaN(statValue) && statValue.toString().indexOf('.') > -1) {
                statValue = statValue.toString();
                statValue = statValue.split('.').join(',');
            }

            header.push('"' + statCategory + '_' + statName + '"');
            content.push('"' + statValue + '"'); // Use , for separating numbers in excel
        }
    }

    // Write / append statistics to historical CSV file
    try {

        // If file does not exist, create it with the header first
        if (!fs.existsSync(statisticsCsvPath)) {
            fs.outputFileSync(statisticsCsvPath, header.join(';') + '\n');
        }
        // Append to CSV Value
        var file = fs.openSync(statisticsCsvPath, 'a'); // Append only
        fs.writeSync(file, content.join(';') + '\n');
        fs.closeSync(file);

    } catch (e) {
        log(' [E] Could not write statistics to ' + statisticsCsvPath);
    }
};