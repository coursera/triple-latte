var fs = require('fs');
var path = require('path');
var wrench = require('wrench');

exports.list = function(dir) {
  if (fs.lstatSync(dir).isFile()) {
    return [dir];
  } else if (fs.lstatSync(dir).isDirectory()) {
    return wrench.readdirSyncRecursive(dir).filter(function(f) {
      return (fs.lstatSync(path.join(dir, f))).isFile();
    });
  }
};

exports.findTests = function(_folders) {
  var folders = Array.isArray(_folders) ? _folders : [_folders];
  var jstests = [];

  // run through each folder, find the tests inside of it and add it to mocha
  folders.forEach(function(folder) {
    if (fs.existsSync(folder)) {
      var stats = fs.statSync(folder);

      if (stats.isDirectory()) {
        var tests = exports.list(folder);

        // grab all the tests
        tests.forEach(function(file) {
          // only add js files
          if(/\.js$/.test(file))
            jstests.push(path.join(folder, file));
        });
      } else if(/\.js$/.test(folder)) {
        jstests.push(folder);
      }
    }
  });

  return jstests;
};
