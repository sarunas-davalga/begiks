"use strict";

var fs = require("fs"),
    path = require("path"),
    when = require("when"),
    nodeFn = require("when/node"),
    App = require("./app");

function AppManager(appsPath) {
    if (!(this instanceof AppManager)) {
        return new AppManager(appsPath);
    }

    var am = this;
    this.apps = {};

    this.init = function appManagerInit() {
        return nodeFn.call(fs.readdir, appsPath)
            .then(function (fileNames) {
                return when.all(fileNames.map(function (fileName) {
                    var appPath = path.join(appsPath, fileName);
                    return nodeFn.call(fs.lstat, appPath)
                        .then(function (stat) {
                            return stat.isDirectory() ? appPath : null;
                        });
                }));
            })
            .then(function (list) {
                return list
                    .filter(function (path) {
                        return !!path;
                    })
                    .map(function (path) {
                        return App.create(path);
                    });
            }.bind(this))
            .then(function (apps) {
                apps.forEach(function (app) {
                    am.apps[app.name] = app;
                });
            }.bind(this));
    };

    function actionOnAllApps(actionName) {
        return Object.keys(am.apps)
            .map(function (appName) {
                return am.apps[appName][actionName]()
                    .then(function () {
                        console.log("App '%s' %s successful. (appManager)", appName, actionName);
                    })
                    .catch(function (e) {
                        console.error("App '%s' %s failed. (appManager)", appName, actionName, e);
                    });
            });
    }

    this.start = function appManagerStart() {
        return am.init()
            .then(function () {
                return when.all(actionOnAllApps("start"));
            });
    };

    this.stop = function () {
        return when.all(actionOnAllApps("stop"));
    };

    this.getApp = function (appName) {
        return am.apps[appName] || null;
    };
}

module.exports = AppManager;