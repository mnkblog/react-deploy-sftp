#!/usr/bin/env node
var zipdir = require("zip-dir");
var Client = require("ssh2").Client;

if (process.argv[2] === "deploy") {
  let prefix = process.argv[4] || "";

  //Read project settings from the current working directory
  let projectSettings;
  try {
    projectSettings = require(process.cwd() + prefix + "/react-up.json");
  } catch (error) {
    if (error.message === "Cannot find module './react-up.json'") {
      console.log("\x1b[31mA react-up.json file has not been found.\x1b[0m");
      process.exit();
    } else {
      throw error;
    }
  }
  //Use the 3rd command line argument to select the environment and use those settings.
  environmentSettings = projectSettings[process.argv[3]];

  //Load project settings.
  const localDir = environmentSettings.buildDir || "./build";
  const remoteDir = environmentSettings.remoteDir || "/var/www/reactApp";
  const archiveName = environmentSettings.archiveName || "deploy.zip";
  prefix = prefix != "" ? "." + prefix + "/" : "";
  //Define commands to be run on the remote machine.
  const cleanCommand = `rm -rf ${remoteDir}/*`;
  const unzipCommand = `cd ${remoteDir} && unzip -o "${archiveName}"`;
  const deleteZip = `rm -rf ${remoteDir}/${archiveName}`;

  //Create a zip of the build directory
  zipdir(localDir, { saveTo: prefix + archiveName }, function (err, buffer) {
    if (err) throw err;
    //Do SFTP transfer
    var conn = new Client();
    conn
      .on("ready", function () {
        console.log("Deployment :: SFTP connection ready");
        conn.sftp(function (err, sftp) {
          if (err) throw err;
          //
          //1. Remove the project dir if it exists.
          //
          console.log("Deployment :: clear folder...");
          conn.exec(cleanCommand, function (err, stream) {
            if (err) throw err;
            stream
              .on("close", function (code, signal) {
                //
                //2. Move tar to remote
                //
                console.log("Deployment :: uploading...");
                sftp.fastPut(
                  prefix + archiveName,
                  remoteDir + "/" + archiveName,
                  function (err) {
                    if (err) throw err;
                    //
                    //3. Dearchive on remote
                    //
                    console.log("Deployment :: upload complete");
                    console.log("Deployment :: dearchiving...");
                    conn.exec(unzipCommand, function (err, stream) {
                      if (err) throw err;
                      stream
                        .on("close", function (code, signal) {
                          console.log("Deployment :: dearchived");
                          //
                          //4. Delete zip file
                          //
                          console.log("Deployment :: delete zip from root...");
                          conn.exec(deleteZip, function () {
                            if (err) throw err;
                            console.log("Deployment :: zip deleted");
                            conn.end();
                          });
                        })
                        .on("data", function (data) {
                          var log = data.toString().trim() || "";
                          if (log != "") console.log("STDOUT: " + log);
                        })
                        .stderr.on("data", function (data) {
                          var log = data.toString().trim() || "";
                          if (log != "") console.log("STDOUT: " + log);
                        });
                    });
                  }
                );
              })
              .on("data", function (data) {
                console.log("STDERR: " + data);
              })
              .stderr.on("data", function (data) {
                console.log("STDERR: " + data);
              });
          });
        });
      })
      .connect({
        host: environmentSettings.host,
        port: environmentSettings.port,
        username: environmentSettings.username,
        password: environmentSettings.password,
      });
  });
} else {
  console.log(
    "\x1b[31mCommand not found. Did you mean >rup deploy ...?\x1b[0m"
  );
}
