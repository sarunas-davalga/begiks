"use strict";

var when = require("when"),
    path = require("path"),
    fs = require("fs"),
    nodeFn = require("when/node"),
    AppInstance = require("./app-instance"),
    versionRegex = /^[0-9]+$/,
    _ = require("lodash");

function App(appPath) {

    if (!(this instanceof App)) {
        return new App(appPath);
    }

    var app = this,
        currentVersionPath = path.join(appPath, "current");

    this.name = path.basename(appPath);
    this.instance = null;
    this.version = null;

    this.getConfig = function appGetConfig() {
        return nodeFn.call(fs.readFile, path.join(appPath, "config.json"))
            .then(function (buff) {
                return JSON.parse(buff);
            });
    };

    this.setConfig = function appSetConfig(config) {
        return when.reject(new Error("Not implemented"));
    };

    this.getVersions = function appGetVersions() {
        return nodeFn.call(fs.readdir, appPath)
            .then(function (fileNames) {
                var list = fileNames
                    .filter(versionRegex.test.bind(versionRegex))
                    .map(function (fileName) {
                        return nodeFn.call(fs.lstat, path.join(appPath, fileName))
                            .then(function (stat) {
                                return stat.isDirectory() ? parseInt(fileName, 10) : null;
                            });
                    });
                return when.all(list);
            })
            .then(function (versions) {
                return versions
                    .filter(function (v) {
                        return !!v;
                    })
                    .sort();
            });
    };

    this.getCurrentVersion = function appGetCurrentVersion() {
        return nodeFn.call(fs.lstat, currentVersionPath)
            .then(function (stat) {
                if (!stat.isSymbolicLink()) {
                    return null;
                }
                return when.all([nodeFn.call(fs.realpath, appPath), nodeFn.call(fs.realpath, currentVersionPath)])
                    .spread(function (realAppPath, realVersionPath) {
                        if (realVersionPath.indexOf(realAppPath) !== 0) {
                            return null;
                        }
                        var str = realVersionPath.substring(realAppPath.length + 1);
                        if (!versionRegex.test(str)) {
                            return null;
                        }
                        return parseInt(str, 10);
                    });
            });
    };

    this.init = function appInit() {
        return when.all([app.getConfig(), app.getVersions(), app.getCurrentVersion()])
            .spread(function (config, versions, currentVersion) {
                if (currentVersion === null || versions.indexOf(currentVersion) === -1) {
                    return;
                }

                app.instance = AppInstance.create({
                    path: path.join(appPath, "" + currentVersion),
                    logOut: path.join(appPath, "app.log"),
                    logErr: path.join(appPath, "app.error.log"),
                    env: config.env
                });
                app.version = currentVersion;
            });
    };

    this.start = function appStart() {
        return (app.instance ? when() : app.init())
            .then(function () {
                if (!app.instance) {
                    throw new Error("App does not have a valid instance to start");
                }

                return app.instance.start();
            });
    };

    this.stop = function appStop() {
        if (!app.instance) {
            return when.reject(new Error("App does not have a valid instance to stop"));
        }

        return app.instance.stop();
    };

    this.getStatus = function appGetStatus() {
        return when.all([app.getVersions(), app.instance ? app.instance.status() : null, app.getConfig()])
            .spread(function (versions, instanceStatus, config) {
                return {
                    runningVersion: app.version,
                    instance: instanceStatus,
                    versions: versions,
                    config: config
                };
            });
    };

    this.switchToVersion = function appSwitchToVersion(version) {
        return app.getVersions()
            .then(function (versions) {
                if (versions.indexOf(version) === -1) {
                    throw new Error("Cannot switch to non-existing version");
                }

                return nodeFn.call(fs.unlink, currentVersionPath)
                    .catch(function () {
                    });
            })
            .then(function () {
                return nodeFn.call(fs.symlink, path.join(appPath, "" + version), currentVersionPath);
            })
            .then(function () {
                if (app.instance) {
                    return app.stop();
                }
            })
            .then(function () {
                app.instance = null;
                app.version = null;
                return app.start();
            });
    };

    function existsPromise(path) {
        var defer = when.defer();
        fs.exists(path, defer.resolve);
        return defer.promise;
    }

    this.getNextVersionNumber = function appGetNextVersionNumber(startFrom) {
        return app.getVersions()
            .then(function (versions) {
                var no = 1;
                if (versions.length > 0) {
                    no = versions.pop() + 1;
                }

                if (no < startFrom) {
                    no = startFrom;
                }
                return existsPromise(path.join(appPath, "" + no))
                    .then(function (exists) {
                        return exists ? app.getNextVersionNumber(no + 1) : no;
                    });
            });
    };

    this.deploy = function appDeploy(archive) {
        // get next version number,
        // extract archive to that directory
        // return which version is deployed
        // npm rebuild should go here!
        return when.reject(new Error("Not implemented"));
    };
}

App.create = function (appPath) {
    return new App(appPath);
};

module.exports = App;