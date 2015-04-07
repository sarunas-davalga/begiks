"use strict";

var buster = require("buster"),
    assert = buster.assert,
    expect = buster.expect,
    fs = require("fs"),
    when = require("when");

var App = require("../server/app"),
    AppInstance = require("../server/app-instance");

buster.testCase("/server/app", {
    "function as constructor": function () {
        assert(App("/some/path") instanceof App);
    },

    "create new instance": function () {
        assert(App.create("/some/path") instanceof App);
    },

    "should set app name as folder": function () {
        expect(new App("/some/path").name).toEqual("path");
        expect(App("/some/other").name).toEqual("other");
        expect(App.create("/some/stuff").name).toEqual("stuff");
    },

    "getConfig": {
        setUp: function () {
            this.readFileStub = this.stub(fs, "readFile").yields(new Error("read-file-error"));

            this.readFileStub.withArgs("/some/path/to/app2/config.json").yields(null, new Buffer("{;}"));
            this.readFileStub.withArgs("/some/path/to/app3/config.json").yields(null, new Buffer('{"env":{"test":1}}'));
        },

        "should fail when config read fails": function () {
            return new App("/some/path/to/app1").getConfig()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("read-file-error");
                });
        },

        "should fail when invalid json config file": function () {
            return new App("/some/path/to/app2").getConfig()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("Unexpected token ;");
                });
        },

        "should return parsed config": function () {
            return new App("/some/path/to/app3").getConfig()
                .then(function (cfg) {
                    expect(cfg).toEqual({env: {test: 1}});
                });
        }
    },

    "getVersions": {
        setUp: function () {

            var statDir = {
                isDirectory: this.stub().returns(true)
            };

            var statNonDir = {
                isDirectory: this.stub().returns(false)
            };

            this.readdirStub = this.stub(fs, "readdir").yields(new Error("read-dir-error"));
            this.readdirStub.withArgs("/some/path2").yields(null, ["1", "2"]);
            this.readdirStub.withArgs("/some/path3").yields(null, ["3", "4", "5"]);

            this.lstatStub = this.stub(fs, "lstat").yields(new Error("lstat-error"));
            this.lstatStub.withArgs("/some/path3/3").yields(null, statDir);
            this.lstatStub.withArgs("/some/path3/4").yields(null, statNonDir);
            this.lstatStub.withArgs("/some/path3/5").yields(null, statDir);
        },

        "should fail when read dir fails": function () {
            return new App("/some/path1").getVersions()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("read-dir-error");
                });
        },

        "should fail when version dir stat fails": function () {
            return new App("/some/path2").getVersions()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("lstat-error");
                });
        },

        "should return only versions that are directories": function () {
            return new App("/some/path3").getVersions()
                .then(function (versions) {
                    expect(versions).toEqual([3, 5]);
                });
        },

        "should not even stat directories when names are not numbers": function () {
            this.readdirStub.withArgs("/some/path3").yields(null, ["3", "4", "f4", "3f", "name", "5"]);

            return new App("/some/path3").getVersions()
                .then(function (versions) {
                    expect(versions).toEqual([3, 5]);
                });
        },

        "should return sorted": function () {
            this.readdirStub.withArgs("/some/path3").yields(null, ["5", "4", "3"]);

            return new App("/some/path3").getVersions()
                .then(function (versions) {
                    expect(versions).toEqual([3, 5]);
                });
        }
    },

    "getCurrentVersion": {
        setUp: function () {
            this.lstatStub = this.stub(fs, "lstat").yields(null, {
                isSymbolicLink: this.stub().returns(true)
            });

            this.lstatStub.withArgs("/some/path1/current").yields(new Error("lstat-error"));

            this.lstatStub.withArgs("/some/path2/current").yields(null, {
                isSymbolicLink: this.stub().returns(false)
            });

            this.realpathStub = this.stub(fs, "realpath").yields(new Error("real-path-error"));
            this.realpathStub.withArgs("/some/path4").yields(null, "/var/path4");
            this.realpathStub.withArgs("/some/path4/current").yields(null, "/usr/path4/3");


            this.realpathStub.withArgs("/some/path5").yields(null, "/var/path5");
            this.realpathStub.withArgs("/some/path5/current").yields(null, "/var/path5/3");

            this.realpathStub.withArgs("/some/path6").yields(null, "/var/path6");
            this.realpathStub.withArgs("/some/path6/current").yields(null, "/var/path6/3f");
        },

        "should fail when lstat fails": function () {
            return new App("/some/path1").getCurrentVersion()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("lstat-error");
                });
        },

        "should return null, when current is not a symlink": function () {
            return new App("/some/path2").getCurrentVersion()
                .then(function (v) {
                    expect(v).toBeNull();
                });
        },

        "should fail when realpath fails": function () {
            return new App("/some/path3").getCurrentVersion()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("real-path-error");
                });
        },

        "should return null, when symlink is pointing not to app dir": function () {
            return new App("/some/path4").getCurrentVersion()
                .then(function (v) {
                    expect(v).toBeNull();
                });
        },

        "should return version": function () {
            return new App("/some/path5").getCurrentVersion()
                .then(function (v) {
                    expect(v).toEqual(3);
                });
        },

        "should return null, when version dir is not a number": function () {
            return new App("/some/path6").getCurrentVersion()
                .then(function (v) {
                    expect(v).toBeNull();
                });
        }
    },

    "init": {
        setUp: function () {
            this.app = new App("/some/path");
            this.getConfigStub = this.stub(this.app, "getConfig")
                .returns(when({env: {test: 1}}));
            this.getVersionsStub = this.stub(this.app, "getVersions")
                .returns(when([1, 2, 3]));
            this.getCurrentVersionStub = this.stub(this.app, "getCurrentVersion")
                .returns(when(3));

            this.createStub = this.stub(AppInstance, "create")
                .returns({name: "some-app"});
        },

        "should fail when config load fails": function () {
            this.getConfigStub.returns(when.reject(new Error("config-error")));

            return this.app.init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("config-error");
                });
        },

        "should fail when versions load fails": function () {
            this.getVersionsStub.returns(when.reject(new Error("versions-error")));

            return this.app.init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("versions-error");
                });
        },

        "should fail when current version load fails": function () {
            this.getCurrentVersionStub.returns(when.reject(new Error("current-version-error")));

            return this.app.init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("current-version-error");
                });
        },

        "should create app instance": function () {
            return this.app.init()
                .then(function () {
                    expect(this.createStub).toHaveBeenCalledOnceWith({
                        path: "/some/path/3",
                        logOut: "/some/path/app.log",
                        logErr: "/some/path/app.error.log",
                        env: {test: 1}
                    });
                    expect(this.app.instance).toEqual({name: "some-app"});
                    expect(this.app.version).toEqual(3);
                }.bind(this));
        },

        "should not create app instance if current version is not set": function () {
            this.getCurrentVersionStub.returns(when(null));

            return this.app.init()
                .then(function () {
                    expect(this.createStub).not.toHaveBeenCalled();
                }.bind(this));
        },

        "should not create app instance if current version is not available in version list": function () {
            this.getCurrentVersionStub.returns(when(16));
            return this.app.init()
                .then(function () {
                    expect(this.createStub).not.toHaveBeenCalled();
                }.bind(this));
        },

        "should return undefined": function () {
            return this.app.init()
                .then(function (res) {
                    expect(res).not.toBeDefined();
                });
        }
    },

    "start": {
        setUp: function () {
            this.app = new App("/some/path");
            this.initStub = this.stub(this.app, "init").returns(when());
        },

        "should fail when init fails": function () {
            this.initStub.returns(when.reject(new Error("init-error")));

            return this.app.start()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("init-error");
                });
        },

        "should start app instance": function () {
            this.initStub.restore();
            var startStub = this.stub();
            this.stub(this.app, "init", function () {
                this.app.instance = {
                    start: startStub
                };
                return when();
            }.bind(this));


            return this.app.start()
                .then(function () {
                    expect(startStub).toHaveBeenCalledOnce();
                });
        },

        "should not init if instance already available": function () {
            this.app.instance = {appInstance: true, start: this.stub()};

            return this.app.start()
                .then(function () {
                    expect(this.initStub).not.toHaveBeenCalled();
                    expect(this.app.instance.start).toHaveBeenCalledOnce();
                }.bind(this));
        },

        "should fail when no app does not have possible instance": function () {
            return this.app.start()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("App does not have a valid instance to start");
                });
        }
    },

    "stop": {
        setUp: function () {
            this.app = new App("/some/path");
        },

        "should fail when no instance available": function () {
            return this.app.stop()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("App does not have a valid instance to stop");
                });
        },

        "should fail when stop fails": function () {
            this.app.instance = {
                stop: this.stub().returns(when.reject(new Error("stop-error"))),
                start: this.stub().returns(when())
            };

            return this.app.start()
                .then(function () {
                    return this.app.stop();
                }.bind(this))
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("stop-error");
                });
        }
    },

    "getStatus": {
        setUp: function () {
            this.app = new App("/some/path");
            this.getVersionsStub = this.stub(this.app, "getVersions")
                .returns(when([1, 2, 3]));

            this.getConfig = this.stub(this.app, "getConfig")
                .returns(when({env: {test: 1}}));
        },

        "should return empty status": function () {
            return this.app.getStatus()
                .then(function (status) {
                    expect(status.runningVersion).toBeNull();
                    expect(status.instance).toBeNull();
                    expect(status.versions).toEqual([1, 2, 3]);
                });
        },

        "should include instance status": function () {
            this.app.instance = {
                status: this.stub().returns(when({instanceStats: 1}))
            };
            this.app.version = 13;

            return this.app.getStatus()
                .then(function (status) {
                    expect(status.runningVersion).toEqual(13);
                    expect(status.instance).toEqual({instanceStats: 1});
                });
        },

        "should include config": function () {
            return this.app.getStatus()
                .then(function (status) {
                    expect(status.config).toEqual({env: {test: 1}});
                });
        }
    },

    "switchToVersion": {
        setUp: function () {
            this.app = new App("/some/path");
            this.app.instance = {myInstance: 1};

            this.unlinkStub = this.stub(fs, "unlink").yields(null);
            this.symlinkStub = this.stub(fs, "symlink").yields(null);

            this.stopStub = this.stub(this.app, "stop").returns(when());
            this.startStub = this.stub(this.app, "start").returns(when());
            this.getVersionsStub = this.stub(this.app, "getVersions")
                .returns(when([1, 2, 5]));
        },

        "should fail when requested switch to non existing version": function () {
            return this.app.switchToVersion(14)
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("Cannot switch to non-existing version");
                });
        },

        "should remove current version symlink": function () {
            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.unlinkStub).toHaveBeenCalledOnceWith("/some/path/current");
                }.bind(this));
        },

        "should not fail when unlink fails": function () {
            this.unlinkStub.yields(new Error("unlink-error"));

            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.unlinkStub).toHaveBeenCalledOnceWith("/some/path/current");
                }.bind(this));
        },

        "should create a symlink to new version": function () {
            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.symlinkStub).toHaveBeenCalledOnceWith("/some/path/5", "/some/path/current");
                }.bind(this));
        },

        "should stop app": function () {
            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.stopStub).toHaveBeenCalledOnce();
                }.bind(this));
        },

        "should start app": function () {
            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.startStub).toHaveBeenCalledOnce();
                }.bind(this));
        },

        "should clear instance before start": function () {
            this.app.version = 31;
            this.startStub.restore();
            this.stub(this.app, "start", function () {
                expect(this.app.instance).toBeNull();
                expect(this.app.version).toBeNull();
                return when();
            }.bind(this));

            return this.app.switchToVersion(5);
        },

        "should not stop, if no current instance exists": function () {
            this.app.instance = null;

            return this.app.switchToVersion(5)
                .then(function () {
                    expect(this.stopStub).not.toHaveBeenCalled();
                }.bind(this));
        }
    },

    "getNextVersionNumber": {
        setUp: function () {
            this.app = new App("/some/path");
            this.existsStub = this.stub(fs, "exists").yields(false);
            this.getVersionsStub = this.stub(this.app, "getVersions")
                .returns(when([1, 3, 4, 14]));
        },

        "should return 15": function () {
            return this.app.getNextVersionNumber()
                .then(function (next) {
                    expect(next).toEqual(15);
                });
        },

        "should return 1 if no versions exists": function () {
            this.getVersionsStub.returns(when([]));

            return this.app.getNextVersionNumber()
                .then(function (next) {
                    expect(next).toEqual(1);
                });
        },

        "should return 2 if 1 exists": function () {
            this.existsStub.withArgs("/some/path/1").yields(true);
            this.getVersionsStub.returns(when([]));

            return this.app.getNextVersionNumber()
                .then(function (next) {
                    expect(next).toEqual(2);
                });
        },

        "should return 20 if requested start from 20": function () {
            return this.app.getNextVersionNumber(20)
                .then(function (next) {
                    expect(next).toEqual(20);
                });
        },

        "should return 22 if 20 and 21 exists": function () {
            this.existsStub.withArgs("/some/path/20").yields(true);
            this.existsStub.withArgs("/some/path/21").yields(true);
            return this.app.getNextVersionNumber(20)
                .then(function (next) {
                    expect(next).toEqual(22);
                });
        }
    },

    "setConfig": {
        setUp: function() {
            this.app = new App("/some/path");
            this.writeFileStub = this.stub(fs, "writeFile").yields(null);
        }
    }
});
