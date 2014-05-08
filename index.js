exports.cli = function() {
  return require('./lib/cli');
};

exports.run = require('./lib/mocha').runner;
