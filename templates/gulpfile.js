var gulp  = require('gulp'),
    NwBuilder = require('node-webkit-builder'),
    Chrome = require('chrome-remote-interface'),
    Promise = require('bluebird'),
    path =require('path'),
    spawn = require('child_process').spawn,
    _ = require('lodash'),
    info = require('./package.json');

var builderOptions = {
    buildType: 'versioned',
    files: './app.nw/**/**',
    buildDir: './dist',
    appName: '<%= appName %>',
    appVersion: '<%= appVersion %>',
    argv: '--remote-debugging-port=9222' //- default debug port is 9222
};


/*
 * mokey patch node-webkit-builder
 */
NwBuilder.prototype.runApp = function () {
    var self = this,
        platform = this._platforms[this.options.currentPlatform],
        executable = path.resolve(platform.cache, platform.runable);

    self.nwProcess = null;

    self.emit('log', 'Launching App with remote debug interface');
    return new Promise(function(resolve, reject) {
        self.nwProcess = spawn(executable, ['--enable-logging', self.options.files.replace(/\*[\/\*]*/,"")].concat(self.options.argv));

        self.nwProcess.stdout.on('data', function(data) {
            self.emit('stdout', data);
        });

        self.nwProcess.stderr.on('data', function(data) {
            self.emit('stderr', data);
        });

        self.nwProcess.on('close', function(code) {
            self.emit('log', 'App exited with code ' + code);
            delete self.nwProcess;
            resolve();
        });
    });
};


function build (cb) {
    var nw = new NwBuilder(builderOptions);

    nw.build().then(function () {
        console.log('Build created');
        cb();
    }).catch(function (error) {
        console.error(error);
    });
}


function run (cb) {
    var nw = new NwBuilder(builderOptions);
    nw.on('log', console.log);
    nw.on('listen', watchsrc);
    
    var waitId = setInterval(function(){
        if(!nw.chrome){
            nw.chrome = Chrome(function(chrome){
                nw.on('reload',function(){
                    if(nw.chrome){
                        chrome.send('Page.reload', {}, function(){console.log('reloaded by remote interface');});
                    }
                });
            }).on('error', function(){
                delete nw.chrome;
            }).on('connect', function(){
                console.log('connected to remote interface');
                clearInterval(waitId);
                nw.emit('listen');
            });
        }
        console.log('wait connection..');
    }, 1000);

    nw.run().then(function () {
        delete nw.chrome;
        console.log('auto-restart node-webkit process');
        run();
        cb();
    }).catch(function (error) {
        console.error(error);
    });
}


function watchsrc(){
    var self = this;

    gulp.watch([
        'app.nw/**/*', '!app.nw/node_modules/**/*', '!app.nw/main.js' //- ignore node.js-context scripts
    ]).on('change', function(file){
        if(self){
            self.emit('reload');
        }
    });

    gulp.watch([
        'app.nw/main.js' //- only node.js-context scripts
    ]).on('change', function(file){
        if(_.has(self, 'nwProcess')){
            self.nwProcess.kill('SIGINT');
        }
    });
}


/*
 * tasks
 */
gulp.task('debug', function(){
    var nw = new NwBuilder(builderOptions);
    nw.on('log', console.log);

    nw.run().then(function () {
        console.log('debug session end');
    }).catch(function (error) {
        console.error(error);
    });
});
gulp.task('build', build);
gulp.task('develop', run);
