var program = require('commander');
var mocha = require('./mocha');
var path = require('path');
var _ = require('underscore');

program.version('0.1.0')
  .usage('[options] [test-directories-or-files]')
  .option('-r, --reporter [format]', 'mocha reporter to use, defaults to awesomeness', 'spec')
  .option('-g, --grep [filter]', 'filter tests by name', undefined)
  .option('-w, --workers [number]', 'number of workers, 0 means none', require('os').cpus().length)
  .option('-s, --split [number]', 'number of tests to run per worker', 4)
  .option('-t, --timeout [time_in_ms]', 'timeout that will kill each test', 2000)
  .option('-c, --config [file]', 'configuration file for specifying tests and globals')
  .parse(process.argv);

var config = program.config ? require(path.resolve(program.config)) : {};

var defaults = {
  reporter: program.reporter,
  grep: program.grep,
  workers: parseInt(program.workers, 10),
  split: parseInt(program.split, 10),
  timeout: parseInt(program.timeout)
};

var options = _.extend(defaults, config);
options.tests = program.args.length ? program.args : config.tests || ['./tests', './test'];

mocha.runner(options, program.config);
