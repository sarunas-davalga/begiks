#!/usr/bin/env node

"use strict";

var nopt = require("nopt"),
    when = require("when"),
    RClient = require("../client/client"),
    url = require("url"),
    path = require("path"),
    knownOpts = {
        "server": url,
        "action": ["list", "start", "stop", "restart", "stats", "create", "switch", "deploy", "config"],
        "exclude": Array,
        "path": path,
        "help": Boolean,
        "switch-to": Number,
        "env": [String, Array],
        "verbose": Boolean
    },
    shortHands = {
        "l": ["--action", "list"],
        "s": ["--action", "start"],
        "k": ["--action", "stop"],
        "r": ["--action", "restart"],
        "x": ["--action", "stats"],
        "c": ["--action", "create"],
        "w": ["--action", "switch"],
        "d": ["--action", "deploy"],
        "g": ["--action", "config"],
        "e": ["--exclude"],
        "h": ["--help"]
    },
    parsed = nopt(knownOpts, shortHands, process.argv, 2);

if (!parsed.server) {
    parsed.server = "http://127.0.0.1:3000";
} else {
    if (parsed.server[parsed.server.length - 1] === "/") {
        parsed.server = parsed.server.substring(0, parsed.server.length - 1);
    }
}

var client = new RClient(parsed.server),
    printText = function () {
        var args = arguments;
        return function () {
            console.log.apply(console, args);
        };
    },
    ap = parsed.argv.remain.length > 0 ? parsed.argv.remain[0] : null,
    appName = function () {
        if (ap) {
            return when(ap);
        }
        return when.reject(new Error("App name required"));
    },

    parseAppEnvConfig = function () {
        var env = {},
            list = (parsed.env || []).map(function (el) {
                var parts = el.split("=");
                return {var: parts.shift(), value: parts.join("=")};
            });

        list.forEach(function (el) {
            env[el.var] = el.value;
            console.log("\t%s=%s", el.var, el.value);
        });
        return env;
    },

    actions = {
        help: {
            run: function () {
                console.log("begiks-cli --action [" + knownOpts.action.join("|") + "] <appName>");
                console.log("\tExample to start app: 'begiks-cli -s <appName>' or 'begiks-cli --action start <appName>'");
                console.log("Short versions for actions: ");
                Object.keys(shortHands).forEach(function (key) {
                    console.log("\t-%s (%s) %s", key, shortHands[key].join(" "), "TODO description");
                });
                console.log();
                console.log("For action 'switch' provide version with --switch-to <version>");
                console.log("To set required application server user --server <url>");
                console.log();
                return when.reject();
            },
            print: function () {
            }
        },
        list: {
            run: function () {
                return client.getApps()
                    .then(function (list) {
                        var apps = list.map(function (name) {
                            return {name: name, stats: null};
                        });

                        if (!parsed.verbose) {
                            return apps;
                        }

                        return when.all(apps.map(function (a) {
                            return client.getAppStats(a.name)
                                .then(function (stats) {
                                    a.stats = stats;
                                    return a;
                                });
                        }));
                    });
            },
            print: function (apps) {
                console.log("App server runs %d apps:", apps.length);
                apps.forEach(function (a) {
                    if (a.stats) {
                        console.log("\t%s version=%s", a.name, a.stats.runningVersion);
                    } else {
                        console.log("\t%s", a.name);
                    }
                });
            }
        },
        start: {
            run: function () {
                return appName().then(client.startApp);
            },
            print: printText("Application '%s' started.", ap)
        },
        stop: {
            run: function () {
                return appName().then(client.stopApp);
            },
            print: printText("Application '%s' stopped.", ap)
        },
        restart: {
            run: function () {
                return appName().then(client.restartApp);
            },
            print: printText("Application '%s' restarted.", ap)
        },
        stats: {
            run: function () {
                return appName().then(client.getAppStats);
            },
            print: function (stats) {
                console.log("Status of application '%s':", ap);
                console.log("\tRunning version = %s", stats.runningVersion);
                if (stats.instance) {
                    console.log("\tInstance running=%s started=%s stopped=%s", stats.instance.running, stats.instance.started, stats.instance.stopped);
                    if (JSON.stringify(stats.instance.env) !== JSON.stringify(stats.config.env)) {
                        console.log("\t!!! Instance has older config than app !!!");
                    }
                }
                if (parsed.verbose) {
                    console.log("\tVersions available: ", stats.versions.join(", "));
                }
                console.log("\tEnvironment:")
                Object.keys(stats.config.env).forEach(function (ev) {
                    console.log("\t\t%s=%s", ev, stats.config.env[ev]);
                });
            }
        },
        create: {
            run: function () {
                var env = parseAppEnvConfig();
                return appName()
                    .then(function (app) {
                        return client.createApp(app, {env: env});
                    });
            },
            print: printText("Application '%s' created.", ap)
        },
        switch: {
            run: function () {
                if (!parsed["switch-to"]) {
                    throw new Error("Provide a version to switch to");
                }
                return appName().then(function (app) {
                    return client.switchAppVersionTo(app, parsed["switch-to"]);
                });
            },
            print: function () {
                console.log("Application '%s' switched to version '%d'", ap, parsed["switch-to"]);
            }
        },
        deploy: {
            run: function () {
                return appName()
                    .then(function (app) {
                        return client.deployApp(app, {
                            path: parsed.path,
                            exclude: parsed.exclude || []
                        });
                    });
            },
            print: function (res) {
                console.log("Application '%s' deployed.", ap, res);
            }
        },
        config: {
            run: function () {
                var env = parseAppEnvConfig();

                return appName()
                    .then(function (app) {
                        if (Object.keys(env).length === 0) {
                            throw new Error("Supply at least one environment variable (--env <var=value>)");
                        }

                        console.log("Setting environment variables:");
                        Object.keys(env).forEach(function (el) {
                            console.log("\t%s=%s", el, env[el]);
                        });

                        return client.setAppConfig(app, {env: env});
                    });
            },
            print: printText("New configuration stored for application '%s'", ap)
        }
    },
    action = actions[parsed.action || "help"];

when()
    .then(function () {
        console.log("Using server at: %s", parsed.server);
        return action.run();
    })
    .then(action.print)
    .catch(function (e) {
        if (e) {
            console.error("Failed to execute action: %s", e.message);
            if (parsed.verbose) {
                console.error(e.stack);
            }
        } else {
            console.log("Unknown error");
        }
        process.exit(1);
    })
    .done();
