"use strict";

var BClient = require("../client/client"),
    path = require("path");

module.exports = function (grunt) {
    grunt.registerTask("begiks", "Deploy application to begiks server", function () {
        var defaultConfig = {
            name: "my-app",
            host: "127.0.0.1",
            port: "3000",
            path: path.resolve(),
            exclude: [],
            excludeDevDeps: true
        };

        grunt.util._.defaults(grunt.config.data.begiks, defaultConfig);

        var done = this.async(),
            cfg = grunt.config.data.begiks,
            client = new BClient("http://" + cfg.host + ":" + cfg.port);

        client.deployApp(cfg.name, {path: cfg.path, exclude: cfg.exclude, excludeDevDeps: cfg.excludeDevDeps})
            .then(done).catch(grunt.fail.error).done();
    });
};
