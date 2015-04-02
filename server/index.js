var express = require("express"),
    app = express();

app.get("/", function (req, res) {
    res.json({hello: 1, env: process.env});
});

app.listen(3000, function () {
    console.log("Started.");
});