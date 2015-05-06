"use strict";

var buster = require("buster"),
    assert = buster.assert,
    expect = buster.expect,
    fs = require("fs"),
    forever = require("forever-monitor"),
    EventEmitter = require("events").EventEmitter,
    when = require("when");

var AppInstance = require("../server/app-instance");

buster.testCase("/server/app-instance", {
    "function as constructor": function () {
        assert(AppInstance({path: "/some/path"}) instanceof AppInstance);
    },

    "create new instance": function () {
        assert(AppInstance.create({path: "/some/path"}) instanceof AppInstance);
    },

    "init": {
        setUp: function () {
            this.readFileStub = this.stub(fs, "readFile").yields(null, new Buffer(JSON.stringify({env: {test: 13}})));
            this.i = new AppInstance({
                path: "/some/path",
                env: {test: 1},
                logOut: "/test/log-out.log",
                logErr: "/test/log-err.log"
            });

            this.foreverChild = new EventEmitter();
            this.foreverChild.start = this.stub();
            this.foreverChild.stop = this.stub();

            this.monitorStub = this.stub(forever, "Monitor")
                .returns(this.foreverChild);
        },

        "should fail when read file fails": function () {
            this.readFileStub.yields(new Error("read-file-error"));
            return this.i.init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("read-file-error");
                    expect(this.readFileStub).toHaveBeenCalledOnceWith("/some/path/package.json");
                }.bind(this));
        },

        "should fail when invalid json supplied": function () {
            this.readFileStub.yields(null, new Buffer("{;}"));
            return this.i.init()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("Unexpected token ;");
                });
        },

        "should create forever child": function () {
            return this.i.init()
                .then(function () {
                    expect(this.monitorStub).toHaveBeenCalledOnceWith("/usr/local/bin/npm", {
                        args: ["start"],
                        silent: true,
                        cwd: "/some/path",
                        env: {test: 1},
                        outFile: "/test/log-out.log",
                        errFile: "/test/log-err.log",
                        logFile: "/test/log-err.log",
                        append: true
                    });
                    assert.same(this.i.process, this.foreverChild);
                }.bind(this));
        }
    },

    "status": {
        setUp: function () {
            this.i = new AppInstance({path: "/some/path", env: {test: 1}});
        },

        "should return empty status": function () {
            return this.i.status()
                .then(function (s) {
                    expect(s.started).toBeFalse();
                    expect(s.stopped).toBeTrue();
                    expect(s.running).toBeFalse();
                });
        },

        "should include env": function () {
            return this.i.status()
                .then(function (s) {
                    expect(s.env).toEqual({test: 1});
                });
        },

        "should contain running=true": function () {
            this.i.process = {running: true};
            return this.i.status()
                .then(function (s) {
                    expect(s.running).toBeTrue();
                });
        }
    },

    "start": {
        setUp: function () {
            this.i = new AppInstance({path: "/some/path", env: {test: 1}});
            this.initStub = this.stub(this.i, "init").returns(when());
        },

        "should fail when ini fails": function () {
            this.initStub.returns(when.reject(new Error("init-error")));

            return this.i.start()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("init-error");
                });
        },

        "should not run init, if process constructed": function () {
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    expect(this.initStub).not.toHaveBeenCalled();
                }.bind(this));
        },

        "should start the process": function () {
            var defer = when.defer();
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
                assert(true);
                defer.resolve();
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return defer.promise;
                });
        },

        "should change status": function () {
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return this.i.status();
                }.bind(this))
                .then(function (s) {
                    expect(s.started).toBeTrue();
                    expect(s.stopped).toBeFalse();
                });
        },

        "should not start twice": function () {
            this.i.process = new EventEmitter();
            var counter = 0;
            this.i.process.start = function () {
                counter++;
                this.i.process.emit("start");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return this.i.start();
                }.bind(this))
                .then(function () {
                    expect(counter).toEqual(1);
                });
        }
    },

    "stop": {
        setUp: function () {
            this.i = new AppInstance({path: "/some/path", env: {test: 1}});
        },

        "should fail when app was not started": function () {
            return this.i.stop()
                .then(this.mock().never())
                .catch(function (e) {
                    assert(e instanceof Error);
                    expect(e.message).toEqual("App was not started");
                });
        },

        "should stop the process": function () {
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
            }.bind(this);
            this.i.process.stop = function () {
                assert(true);
                this.i.process.emit("stop");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return this.i.stop();
                }.bind(this));
        },

        "should clear instance after stop": function () {
            var counter = 0;
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
            }.bind(this);
            this.i.process.stop = function () {
                counter++;
                this.i.process.emit("stop");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return this.i.stop();
                }.bind(this))
                .then(function () {
                    expect(this.i.process).toBeNull();
                }.bind(this));
        },

        "should change status": function () {
            this.i.process = new EventEmitter();
            this.i.process.start = function () {
                this.i.process.emit("start");
            }.bind(this);
            this.i.process.stop = function () {
                assert(true);
                this.i.process.emit("stop");
            }.bind(this);

            return this.i.start()
                .then(function () {
                    return this.i.stop();
                }.bind(this))
                .then(function () {
                    return this.i.status();
                }.bind(this))
                .then(function (s) {
                    expect(s.stopped).toBeTrue();
                    expect(s.started).toBeFalse();
                });
        }
    }
});