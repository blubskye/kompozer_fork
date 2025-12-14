// Kaze: this overloads FireFTP's scripts to ensure proper KompoZer integration

function loadSiteManager(pruneTemp, importFile) { // TODO
  // read gSiteManager data
  try {
    gAccountField.removeAllItems();

    if (!gFtp.isConnected) {
      gFtp.host         = "";
      gFtp.port         = 21;
      gFtp.security     = "";
      gFtp.login        = "";
      gFtp.password     = "";
      gFtp.passiveMode  = true;
      gFtp.initialPath  = "";
      gFtp.setEncoding("UTF-8");
      gAccount          = "";
      gDownloadCaseMode = 0;
      gUploadCaseMode   = 0;
      gWebHost          = "";
      gPrefix           = "";
      gRemotePath.value = "/";
    }

    var file;
    if (importFile) {
      file = importFile;
    } else {
      file = gProfileDir.clone();
      file.append("fireFTPsites.dat");
    }

    if (!file.exists() && !importFile) {
      gSiteManager = new Array();
    } else if (file.exists()) {
      var fstream  = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
      var sstream  = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
      fstream.init(file, 1, 0, false);
      sstream.init(fstream);

      var siteData = "";
      var str      = sstream.read(-1);

      while (str.length > 0) {
        siteData += str;
        str       = sstream.read(-1);
      }

      if (importFile) {
        try {
          var tempSiteManager = eval(siteData);
        } catch (ex) {
          error(gStrbundle.getString("badImport"));
          sstream.close();
          fstream.close();
          return;
        }

        var passCheck = false;
        var toUTF8    = Components.classes["@mozilla.org/intl/utf8converterservice;1"].getService(Components.interfaces.nsIUTF8ConverterService);
        var key;
        for (var x = 0; x < tempSiteManager.length; ++x) {
          if (tempSiteManager[x].passcheck) {
            passCheck = true;
            var passwordObject       = new Object();
            passwordObject.returnVal = false;

            window.openDialog("chrome://fireftp/content/password2.xul", "password", "chrome,modal,dialog,resizable,centerscreen", passwordObject);

            if (passwordObject.returnVal) {
              key = passwordObject.password;
            } else {
              sstream.close();
              fstream.close();
              return;
            }

            key = key ? key : "";
            if (rc4Decrypt(key, tempSiteManager[x].password) != "check123") {
              error(gStrbundle.getString("badPassword"));
              sstream.close();
              fstream.close();
              return;
            }
            break;
          }
        }

        for (var x = 0; x < tempSiteManager.length; ++x) {
          if (tempSiteManager[x].passcheck) {
            continue;
          }

          var found   = true;
          var count   = 0;
          var skip    = true;
          var account = tempSiteManager[x].account;

          while (found) {
            found = false;

            for (var y = 0; y < gSiteManager.length; ++y) {
              if (gSiteManager[y].account == account) {
                found = true;

                for (i in gSiteManager[y]) {                         // if it's the exact same object skip it
                  if (i != "password" && gSiteManager[y][i] != tempSiteManager[x][i]) {
                    skip = false;
                    break;
                  }
                }

                if (skip) {
                  break;
                }

                ++count;
                account = tempSiteManager[x].account + '-' + count.toString();
                break;
              }
            }

            if (skip) {
              break;
            }
          }

          if (skip && found) {
            continue;
          }

          if ((gSlash == "/" && tempSiteManager[x].localdir.indexOf("/") == -1) || (gSlash == "\\" && tempSiteManager[x].localdir.indexOf("\\") == -1)) {
            tempSiteManager[x].localdir = "";
            tempSiteManager[x].treesync = false;
          }

          if (passCheck) {
            tempSiteManager[x].password = rc4Decrypt(key, tempSiteManager[x].password);

            try {
              tempSiteManager[x].password = toUTF8.convertStringToUTF8(tempSiteManager[x].password, "UTF-8", 1);
            } catch (ex) {
              debug(ex);
            }
          }

          if (gPasswordMode) {
            try {                                                            // save username & password
              var recordedHost  = (tempSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.") + tempSiteManager[x].host;

              gPassManager.addUser(recordedHost, tempSiteManager[x].login, tempSiteManager[x].password);
            } catch (ex) {
              debug(ex);
            }
          }

          tempSiteManager[x].account = account;
          gSiteManager.push(tempSiteManager[x]);
        }
      } else {
        gSiteManager = eval(siteData);
      }

      if (gPasswordMode) {
        for (var x = 0; x < gSiteManager.length; ++x) {              // retrieve passwords from passwordmanager
          try {
            var host = { value : "" };    var login = { value : "" };    var password = { value : "" };
            gPassManagerIn.findPasswordEntry((gSiteManager[x].host.indexOf("ftp.") == 0 ? '' : "ftp.")
                                            + gSiteManager[x].host, gSiteManager[x].login, "", host, login, password);

            gSiteManager[x].password = password.value;
          } catch (ex) { }
        }
      }

      sstream.close();
      fstream.close();

      if (pruneTemp) {
        for (var x = gSiteManager.length - 1; x >= 0; --x) {
          if (gSiteManager[x].temporary) {
            gSiteManager.splice(x, 1);
          }
        }
      }

      for (var x = 0; x < gSiteManager.length; ++x) {
        gAccountField.appendItem(gSiteManager[x].account, gSiteManager[x].account);
      }
    }

    if (gSiteManager.length) {
      gAccountField.setAttribute("label", gStrbundle.getString("chooseAccount"));
    } else {
      gAccountField.setAttribute("label", gStrbundle.getString("noAccounts"));
    }

    accountButtonsDisabler(true);
  } catch (ex) {
    debug(ex);
  }
}

var ftpObserver = {
  extraCallback : null,

  onConnectionRefused : function() {
    displayWelcomeMessage(gFtp.welcomeMessage);
    setConnectButton(true);
  },

  onConnected : function() {
    connectedButtonsDisabler();
    setConnectButton(false);

    if (gFtp.security) {
      $('remotepath').setAttribute("security", "on");
    }
  },

  onWelcomed : function() {
    displayWelcomeMessage(gFtp.welcomeMessage);
  },

  onLoginAccepted : function() {
    var newConnectedHost = gFtp.login + "@" + gFtp.host;

    if (gFtp.isConnected && newConnectedHost != gFtp.connectedHost) {       // switching to a different host or different login
      gFtp.connectedHost     = newConnectedHost;
      remoteTree.treebox.rowCountChanged(0,    -remoteTree.rowCount);
      remoteTree.rowCount    = 0;
      remoteTree.data        = new Array();
      remoteDirTree.treebox.rowCountChanged(0, -remoteDirTree.rowCount);
      remoteDirTree.rowCount = 0;
      remoteDirTree.data     = new Array();
    }
  },

  onLoginDenied : function() {
    connect(false, true);
  },

  onDisconnected : function() {
    try {
      if (connectedButtonsDisabler) {                                       // connectedButtonsDisabler could be gone b/c we're disposing
        connectedButtonsDisabler();
        setConnectButton(true);
        remoteDirTree.extraCallback = null;
        this.extraCallback          = null;
        gTreeSyncManager            = false;
        remoteTree.pasteFiles       = new Array();
        $('remotePasteContext').setAttribute("disabled", true);
        $('remotepath').removeAttribute("security");
      }
    } catch (ex) { }
  },

  onReconnecting : function() {
    $('abortbutton').disabled = false;
  },

  onAbort : function() {
    remoteDirTree.extraCallback = null;
    this.extraCallback          = null;
    gTreeSyncManager            = false;

    if (!gSearchRunning) {
      localTree.refresh();
      remoteTree.refresh();
    }
  },

  onIsReadyChange : function(state) {
    try {
      window.onbeforeunload = state ? null : beforeUnload;

      if (gLoadUrl && state && gFtp.isConnected && !gFtp.eventQueue.length) { // if it's an external link check to see if it's a file to download
        var leafName = gLoadUrl.substring(gLoadUrl.lastIndexOf('/') + 1);
        var index = -1;

        for (var x = 0; x < gFtp.listData.length; ++x) {
          if (leafName == gFtp.listData[x].leafName) {
            index = x;
            break;
          }
        }

        var loadUrl = gLoadUrl;
        gLoadUrl    = "";

        if (index == -1) {
          appendLog(gStrbundle.getString("remoteNoExist"), 'error', "error");
          return;
        }

        if (gFtp.listData[index].isDirectory()) {
          remoteDirTree.changeDir(loadUrl);
        } else {                                                              // if it is, well, then download it
          var prefBranch = gPrefsService.getBranch("browser.");

          try {
            if (!prefBranch.getBoolPref("download.useDownloadDir")) {
              if (!browseLocal(gStrbundle.getString("saveFileIn"))) {
                return;
              }
            }
          } catch (ex) { }

          remoteTree.selection.select(index);
          new transfer().start(true);
        }
      }
    } catch (ex) { }
  },

  onShouldRefresh : function(local, remote, dir) {
    if (gRefreshMode && local) {
      if (this.extraCallback) {
        var tempCallback   = this.extraCallback;
        this.extraCallback = null;
        tempCallback();
      } else {
        if (gLocalPath.value != dir) {
          localDirTree.addDirtyList(dir);
        } else {
          localTree.refresh();
        }
      }
    }

    if (gRefreshMode && remote) {
      if (this.extraCallback) {
        var tempCallback   = this.extraCallback;
        this.extraCallback = null;
        tempCallback();
      } else {
        if (gRemotePath.value != dir) {
          remoteDirTree.addDirtyList(dir);
        } else {
          remoteTree.refresh();
        }
      }
    }
  },

  onChangeDir : function(path, dontUpdateView, skipRecursion) {
    if (!dontUpdateView) {
      if (skipRecursion) {
        gRemotePath.value = path ? path : gRemotePath.value;
        remoteDirTree.dontPanic();                                          // don't forget to bring a towel    
      } else {
        remoteDirTree.changeDir(path ? path : gRemotePath.value);
      }
    }
  },

  onDirNotFound : function(buffer) {                                        // so this isn't exactly the cleanest way to do it, bite me
    var changeDirPath;

    if (gFtp.eventQueue.length > 1 && gFtp.eventQueue[1].cmd == "LIST" && (typeof gFtp.eventQueue[1].callback == "string")
                                                                       && gFtp.eventQueue[1].callback.indexOf("remoteDirTree.changeDir(") != -1) {
      changeDirPath = gFtp.eventQueue[1].callback.substring(gFtp.eventQueue[1].callback.indexOf("'") + 1, gFtp.eventQueue[1].callback.length - 2);
    }

    if (gFtp.eventQueue.length > 1 && gFtp.eventQueue[1].cmd == "LIST") {
      gFtp.eventQueue.shift();                                              // get rid of pasv and list in the queue
      gFtp.eventQueue.shift();
      gFtp.trashQueue = new Array();
    }

    if (changeDirPath) {                                                    // this is a fix for people who can't access '/' on their remote hosts
      gRemotePath.value = changeDirPath;
      remoteDirTree.dontPanic();                                            // don't forget to bring a towel
    }
  }
};
