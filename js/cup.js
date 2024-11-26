window.myApp = window.myApp || {};
myApp.dashboard = (function ($) {
  var _template = "";
  var _loaded = 0;
  var _intervalId = 0;
  var _start = Date.now();
  var _refresh = ((typeof (__refresh) == "number") ? __refresh : 300);
  var _uptimeRanges = "";
  var _secondsToday = 0;
  var $_container = {};
  var $_lastUpdate = {};
  var $_serverTitle = {};
  var showQueue = [];
  var tmpDate;
  var dateStr = "";
  var _hasError = false;

  function init() {
    _start = Date.now();
    _template = $('#server-template').html();
    $_container = $('#server-container').html('');
    $_serverTitle = $('#server-title').html('');
    $_lastUpdate = $('#last-update');

    $_serverTitle.append("<th style=\"width:21%\"></th>");
    $_serverTitle.append("<th style=\"width:9%\">近30日</th>");
    for (var d = 6; d >= 0; d--) {
      tmpDate = new Date(+ new Date() - 86400000 * d);
      dateStr = (tmpDate.getMonth() + 1) + "-" + tmpDate.getDate();
      $_serverTitle.append("<th style=\"width:10%\">" + dateStr + "</th>");
    }
    var ranges = getUptimeRanges();
    _uptimeRanges = ranges.ranges;
    _secondsToday = ranges.secondsToday;

    _loaded = 0;
    showQueue = [];
    _hasError = false;

    for (var i in __apiKeys) {
      getUptime(__apiKeys[i], i);
    }
    _intervalId = setInterval(countdown, 1000);
  }
  function getUptimeRanges() {
    var now = +new Date();
    var midnight = +(new Date).setHours(0, 0, 0, 0);
    now = Math.floor(now / 1000);
    midnight = Math.floor(midnight / 1000);

    var r = []; // custom_uptime_ranges
    r.push((now - 86400 * 30) + '_' + now);
    r.push((midnight - 86400 * 6) + '_' + (midnight - 86400 * 5 - 1));
    r.push((midnight - 86400 * 5) + '_' + (midnight - 86400 * 4 - 1));
    r.push((midnight - 86400 * 4) + '_' + (midnight - 86400 * 3 - 1));
    r.push((midnight - 86400 * 3) + '_' + (midnight - 86400 * 2 - 1));
    r.push((midnight - 86400 * 2) + '_' + (midnight - 86400 * 1 - 1));
    r.push((midnight - 86400 * 1) + '_' + (midnight - 86400 * 0 - 1));
    if (now === midnight) now += 1;
    r.push(midnight + '_' + now);
    return { ranges: r.join('-'), secondsToday: now - midnight };
  }
  /* load uptime variables from UptimeRobot
  */
  function getUptime(apiKey, id) {
    $.post({
      url: 'https://api.uptimerobot.com/v2/getMonitors',
      data: 'api_key=' + apiKey + '&custom_uptime_ranges=' + _uptimeRanges + '&format=json&logs=1&logs_limit=100',
      dataType: 'json',
      success: function (str) {
        var ctxs = [];
        for (var i in str.monitors) {
          ctxs.push(buildServerHTML(str.monitors[i]));
        }
        showQueue[id] = { id: id, ctxs: ctxs, shown: false };
        updatePage();
      }
    });
  }

  /* build the html */
  function buildServerHTML(data, ids) {
    data.alert = "";
    switch (parseInt(data.status, 10)) {
      case 0:
        data.statusText = "未知";
        data.statusIcon = "fa-question";
        data.label = "default";
        break;
      case 1:
        data.statusText = "未知";
        data.statusIcon = "fa-question";
        data.label = "default";
        break;
      case 2:
        data.statusText = "正常";
        data.statusIcon = "fa-check";
        data.label = "success";
        data.alert = "";
        break;
      case 8:
        data.statusText = "异常";
        data.statusIcon = "fa-exclamation";
        data.label = "warning";
        data.alert = "warning";
        _hasError = true;
        break;
      case 9:
        data.statusText = "故障";
        data.statusIcon = "fa-xmark";
        data.label = "danger";
        data.alert = "danger";
        _hasError = true;
        break;
    }

    //make sure log is set
    var barStartTime, barEndTime, period, bar = [], remainLen = 1;
    period = 86400000; // 24 hrs
    barEndTime = + new Date()
    barStartTime = barEndTime - period;
    if (!data.logs.length) {
      var typeid;
      switch (parseInt(data.status, 10)) {
        case 2:
          typeid = 2; //green
          break;
        case 8:
        case 9:
          typeid = 1; //red
          break;
        default:
          typeid = 0; //grey
      }
      bar.push({
        typeid: typeid,
        len: 1,
        left: barStartTime,
        right: barEndTime
      });
    } else {
      var starttime = barStartTime,
        endtime = barEndTime,
        startType, endType;
      for (var r = 0; r < data.logs.length; r++) {
        starttime = data.logs[r].datetime * 1000;
        if (starttime < barStartTime) {
          starttime = barStartTime;
        }
        endType = data.logs[r].type;
        switch (parseInt(endType, 10)) {
          case 1:
            endType = 1; //grey
            break;
          case 2:
            endType = 2; //green
            break;
          default:
            endType = 0; //grey
        }
        remainLen = remainLen - (endtime - starttime) / period;
        if (bar.length > 0 && bar[bar.length - 1].typeid == endType) {
          bar[bar.length - 1].len += (endtime - starttime) / period;
          bar[bar.length - 1].left = starttime;
        } else {
          bar.push({
            typeid: endType,
            len: (endtime - starttime) / period,
            left: starttime,
            right: endtime
          });
        }
        endtime = starttime;
        if (starttime <= barStartTime) {
          break;
        }
      }
      if (starttime > barStartTime) {
        switch (parseInt(endType, 10)) {
          case 1:
            startType = 2;
            //grey
            break;
          case 2:
            startType = 1;
            //green
            break;
          default:
            startType = 0;
          //grey
        }
        if (bar.length > 0 && bar[bar.length - 1].typeid == endType) {
          bar[bar.length - 1].len += remainLen;
          bar[bar.length - 1].left = barStartTime;
        } else {
          bar.push({
            typeid: startType,
            len: remainLen,
            start: barStartTime,
            end: bar[bar.length - 1].left
          });
        }
      }
    }
    var stat, stattip;
    data.progress = [];
    while (stat = bar.pop()) {
      stattip = "" + Type2Word(parseInt(stat.typeid), true);
      if (stat.len == 1) {
        stattip += " (近24小时)"
      } else {
        if (stat.right - stat.left < 1000 * 3540) {
          stattip += " (" + new Number((stat.right - stat.left) / (1000 * 60)).toFixed(0) + " 分钟)";
        } else {
          stattip += " (" + new Number((stat.right - stat.left) / (1000 * 3600)).toFixed(1) + " 小时)";
        }
        stattip += "<br><span class=\"ttime\">" + num2string(stat.left) + " ~ " + num2string(stat.right) + "</span>";
      }
      data.progress.push({
        typeid: stat.typeid,
        types: getLogType,
        len: (stat.len * 100).toString(),
        stattip: stattip
      })
    }
    // gather data for the graphs
    var uptimes = data.custom_uptime_ranges.split("-");
    var upTimeText = [], hours, minutes;
    for (a = 0; a < uptimes.length; a++) {
      if (a === 0) { // last 30 days
        minutes = (100 - uptimes[a]) / 100 * 1440 * 30;
      } else if (a === 7) { // today
        minutes = (100 - uptimes[a]) / 100 * (_secondsToday / 60);
      } else {
        minutes = (100 - uptimes[a]) / 100 * 1440;
      }
      hours = minutes / 60;
      if (uptimes[a] >= 99.99) {
        upTimeText[a] = "可用率 100%";
      } else if (minutes < 60) {
        upTimeText[a] = "可用率 " + new Number(uptimes[a]).toFixed(2) + "%<br>故障 " + new Number(minutes).toFixed(0) + " 分钟";
      } else {
        upTimeText[a] = "可用率 " + new Number(uptimes[a]).toFixed(2) + "%<br>故障 " + new Number(hours).toFixed(1) + " 小时";
      }
    }
    //uptimes.push(data.allTimeUptimeRatio);
    data.charts = [
      { uptime: uptimes[0], upTimeText: upTimeText[0], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[1], upTimeText: upTimeText[1], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[2], upTimeText: upTimeText[2], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[3], upTimeText: upTimeText[3], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[4], upTimeText: upTimeText[4], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[5], upTimeText: upTimeText[5], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[6], upTimeText: upTimeText[6], upType: getUptimeColor, upSign: getUptimeSign },
      { uptime: uptimes[7], upTimeText: upTimeText[7], upType: getUptimeColor, upSign: getUptimeSign }
    ];
    var $output = $(Mustache.render(_template, data));
    return $output;
  }

  /* display the html on the page */
  function updatePage() {
    //append it in the container
    for (var k = 0; k < __apiKeys.length; k++) {
      if (showQueue[k] == undefined) {
        break;
      } else if (showQueue[k].shown === true) {
        continue;
      } else {
        for (var i in showQueue[k].ctxs) {
          $_container.append(showQueue[k].ctxs[i]);
        }
        showQueue[k].shown = true;
        _loaded++;
      }
    }

    if (_loaded === __apiKeys.length) {
      $('.set-tooltip').tooltip({
        html: true
      });
      $('#stattip-load').addClass('d-none');
      if (_hasError) {
        $('#stattip-err').removeClass('d-none');
        $('#stattip-ok').addClass('d-none');
      } else {
        $('#stattip-ok').removeClass('d-none');
        $('#stattip-err').addClass('d-none');
      }
    }
  }
  /* count down till next refresh */
  function countdown() {
    var now = Date.now();
    var elapsed = parseInt((now - _start) / 1000, 10);
    var mins = Math.floor((_refresh - elapsed) / 60);
    var secs = _refresh - (mins * 60) - elapsed;
    secs = (secs < 10) ? "0" + secs : secs;
    if (elapsed > _refresh) {
      clearInterval(_intervalId);
      init();
    } else {
      $_lastUpdate.html(mins + ':' + secs);
    }
  }
  /* give the icon in front of log line a nice color */
  function getLogType() {
    switch (parseInt(this.typeid, 10)) {
      case 1:
        return "danger";
      case 2:
        return "success";
      case 99:
        return "default";
      case 98:
        return "default";
      default:
        return "default";
    }
  }
  function Type2Word(t, icon) {
    switch (t) {
      case 1:
        return (icon ? "<span class=\"fa-solid fa-circle-xmark\"></span> " : "") + "故障";
      case 2:
        return (icon ? "<span class=\"fa-solid fa-circle-check\"></span> " : "") + "正常";
      //case 99:
      //  return "未知";
      //case 98:
      //  return "未知";
      default:
        return (icon ? "<span class=\"fa-sold fa-circle-question\"></span> " : "") + "未知";
    }
  }
  function num2string(num) {
    tmpDate = new Date(parseInt(num));
    dateStr = (tmpDate.getMonth() + 1) + "-" + tmpDate.getDate() + " " + tmpDate.getHours() + ":" + (tmpDate.getMinutes() < 10 ? "0" + tmpDate.getMinutes() : tmpDate.getMinutes());
    return dateStr;
  }
  function getUptimeColor() {
    var upt = this.uptime;
    if (upt >= 99.99) {
      return "success";
    } else if (upt >= 98.00) {
      return "warning";
    } else {
      return "danger";
    }
  }
  function getUptimeSign() {
    var upt = this.uptime;
    if (upt >= 99.99) {
      return "fa-check-circle";
    } else if (upt >= 98.00) {
      return "fa-circle-exclamation";
    } else {
      return "fa-circle-xmark";
    }
  }
  return {
    init: init
  };
}(jQuery));
