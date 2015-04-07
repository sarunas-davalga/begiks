"use strict";

var convict = require("convict"),
    conf = convict({
        port: {
            doc: "App runner web interface port",
            format: "port",
            default: 3000,
            env: "PORT",
            arg: "port"
        },
        apps_path: {
            doc: "Path to applications",
            default: "/var/apps",
            env: "APPS_PATH",
            arg: "apps-path"
        }
    });

conf.validate();
module.exports = conf;