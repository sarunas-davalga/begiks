"use strict";

var fs = require("fs"),
    when = require("when"),
    nodeFn = require("when/node"),
    path = require("path"),
    forever = require("forever-monitor"),
    _ = require("lodash");

function AppInstance(opts) {

    if (!(this instanceof AppInstance)) {
        return new AppInstance(opts);
    }

    this.process = null;

    var instance = this,
        status = {
            started: false,
            stopped: true
        };

    this.init = function appInstanceInit() {
        return nodeFn.call(fs.readFile, path.join(opts.path, "package.json"))
            .then(function (buff) {
                return JSON.parse(buff);
            })
            .then(function (config) {
                instance.process = new (forever.Monitor)("/usr/local/bin/npm", {
                    args: ["start"],
                    silent: true,
                    cwd: opts.path,
                    env: config.env,
                    outFile: path.join(opts.path, "app.log"),
                    errFile: path.join(opts.path, "app.error.log"),
                    logFile: path.join(opts.path, "app.error.log")
                });

                instance.process.on("error", function (e) {
                    console.error("Forever error (TODO)", e);
                });

                instance.process.on("exit", function () {
                    console.log("Process exit");
                });

                instance.process.on("start", function () {
                    console.log("Process start");
                });

                instance.process.on("stop", function () {
                    console.log("Process stop");
                });

                instance.process.on("stderr", function (buff) {
                    //console.log("Process stderr", buff.toString());
                });

                // TODO catch other events (start,stop,restart,exit)
            });
    };

    this.start = function appInstanceStart() {
        return (instance.process ? when() : instance.init())
            .then(function () {
                if (status.started) {
                    return;
                }
                var defer = when.defer();
                instance.process.once("start", defer.resolve);
                instance.process.start();
                status.started = true;
                status.stopped = false;
                return defer.promise;
            });
    };

    this.stop = function appInstanceStop() {
        if (!instance.process) {
            return when.reject(new Error("App was not started"));
        }

        if (status.stopped) {
            return when();
        }

        var defer = when.defer();
        instance.process.once("stop", defer.resolve);
        instance.process.stop();
        status.stopped = true;
        status.started = false;
        return defer.promise;
    };

    this.status = function appInstanceStatus() {
        var running = false;
        if (instance.process) {
            running = !!instance.process.running;
        }
        return when(_.extend({env: opts.env, running: running}, status));
    };
}

AppInstance.create = function (opts) {
    return new AppInstance(opts);
};

module.exports = AppInstance;