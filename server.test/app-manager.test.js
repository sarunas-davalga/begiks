"use strict";

var buster = require("buster"),
    assert = buster.assert,
    expect = buster.expect,
    when = require("when");

var fs = require("fs");

var AppManager = require("../server/app-manager"),
    App = require("../server/app");

buster.testCase("/server/app-manager", {
    "function as constructor": function () {
        assert(AppManager("/some/path") instanceof AppManager);
    },

    "init": {
        setUp: function () {
            this.readdirStub = this.stub(fs, "readdir").yields(new Error("read-dir-error"));
            this.readdirStub.withArgs("/some/l-error").yields(null, ["f1", "f4"]);
            this.readdirStub.withArgs("/other/path").yields(null, ["f1", "f2", "f3"]);

            var statDir = {
                isDirectory: function () {
                    return true;
                }
            };

            var statFile = {
                isDirectory: function () {
                    return false;
                }
            };
            this.lstatStub = this.stub(fs, "lstat").yields(new Error("lstat-error"));
            this.lstatStub.withArgs("/other/path/f1").yields(null, statDir);
            this.lstatStub.withArgs("/other/path/f2").yields(null, statDir);
            this.lstatStub.withArgs("/other/path/f3").yields(null, statFile);

            this.createStub = this.stub(App, "create").throws(new Error("app-create-error"));
            this.createStub.withArgs("/other/path/f1").returns({app1: true, name: "app1"});
            this.createStub.withArgs("/other/path/f2").returns({app2: true, name: "app2"});
        },

        "should fail when read dir fails": function () {
            return new AppManager("/some/path").init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("read-dir-error");
                });
        },

        "should fail when stat of any files fails": function () {
            return new AppManager("/some/l-error").init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("lstat-error");
                });
        },

        "should construct apps from directories": function () {
            var am = new AppManager("/other/path");
            return am.init()
                .then(function () {
                    expect(am.apps).toEqual({
                        app1: {
                            app1: true, name: "app1"
                        },
                        app2: {
                            app2: true, name: "app2"
                        }
                    });
                    expect(this.createStub).toHaveBeenCalledTwice();
                }.bind(this));
        }
    },

    "start": {
        setUp: function () {
            this.am = new AppManager("/some/path");
            this.initStub = this.stub(this.am, "init").returns(when());
        },

        "should fail when init fails": function () {
            this.initStub.returns(when.reject(new Error("init-error")));

            return this.am.start()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("init-error");
                });
        },

        "should start app": function () {
            var start = this.stub().returns(when());
            this.am.apps = {
                app1: {
                    start: start
                }
            };

            return this.am.start()
                .then(function () {
                    expect(start).toHaveBeenCalledOnce();
                });
        },

        "should not fail when app start fails": function () {
            var start = this.stub().returns(when.reject(new Error("app-start-error")));
            this.am.apps = {
                app1: {
                    start: start
                }
            };

            return this.am.start()
                .then(function () {
                    expect(start).toHaveBeenCalledOnce();
                });
        }
    },

    "stop": {
        setUp: function () {
            this.am = new AppManager("/some/path");
        },

        "should stop apps": function () {
            var stop = this.stub().returns(when());

            this.am.apps = {
                app1: {
                    stop: stop
                }
            };

            return this.am.stop()
                .then(function () {
                    expect(stop).toHaveBeenCalledOnce();
                });
        },

        "should not fail when app stop fails": function () {
            var stop = this.stub().returns(when.reject(new Error("app-stop-error")));

            this.am.apps = {
                app1: {
                    stop: stop
                }
            };

            return this.am.stop()
                .then(function () {
                    expect(stop).toHaveBeenCalledOnce();
                });
        }
    },

    "getApp": {
        setUp: function () {
            this.am = new AppManager("/some/path");
        },

        "should return null for not found app": function () {
            expect(this.am.getApp("non-existing")).toBeNull();
        },

        "should return requested app": function () {
            this.am.apps = {
                app1: {app1: true},
                app2: {app2: true}
            };

            expect(this.am.getApp("app2")).toEqual({app2: true});
        }
    },

    "createApp": {
        setUp: function () {
            this.am = new AppManager("/some/path");
            this.mkdirStub = this.stub(fs, "mkdir").yields(null);
            this.mkdirStub.withArgs("/some/path/app1").yields(new Error("mkdir-error"));
            this.newApp = {
                newApp: true,
                setConfig: this.stub().returns(when())
            };
            this.createStub = this.stub(App, "create")
                .returns(this.newApp);
        },

        "should fail when mkdir fails": function () {
            return this.am.createApp("app1", {db: "test"})
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("mkdir-error");
                });
        },

        "should fail when app already exists": function () {
            this.am.apps["app2"] = {};
            return this.am.createApp("app2", {db: "test"})
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("App already exists");
                    expect(this.mkdirStub).not.toHaveBeenCalled();
                }.bind(this));
        },

        "should create a new app": function () {
            return this.am.createApp("app2", {db: "test"})
                .then(function () {
                    expect(this.createStub).toHaveBeenCalledOnceWith("/some/path/app2");
                }.bind(this));
        },

        "should set to apps": function () {
            return this.am.createApp("app2", {db: "test"})
                .then(function () {
                    assert.same(this.newApp, this.am.apps.app2);
                }.bind(this));
        },

        "should set passed config to app": function () {
            return this.am.createApp("app2", {db: "test"})
                .then(function () {
                    expect(this.newApp.setConfig).toHaveBeenCalledOnceWith({db: "test"});
                }.bind(this));
        }
    }
});