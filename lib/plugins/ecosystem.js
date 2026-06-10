'use strict';

var _ = require('lodash');
var times = require('../times');

function init (ctx) {
  var moment = ctx.moment;
  var levels = ctx.levels;
  var utils = require('../utils')(ctx);
  var translate = ctx.language.translate;

  var SOURCE_RULES = [
    { key: 'xdrip', label: 'xDrip+', match: /xdrip|x drip/i, blocks: ['xdripjs'] }
    , { key: 'aaps', label: 'AndroidAPS', match: /androidaps|aaps|@androidaps/i, blocks: ['openaps', 'loop', 'pump'] }
    , { key: 'camaps', label: 'CamAPS FX', match: /camaps|cam aps|camaps fx/i, blocks: ['openaps', 'loop'] }
    , { key: 'companion', label: 'CamAPS Companion', match: /companion|mylife companion|camaps companion/i, blocks: [] }
    , { key: 'glooko', label: 'Glooko / Connect', match: /glooko|diasend|nightscout-connect|nsconnect|connect/i, blocks: [] }
    , { key: 'ypsopump', label: 'YpsoPump', match: /ypsopump|ypsomed|mylife pump/i, blocks: ['pump'] }
    , { key: 'libre', label: 'Libre', match: /libre|abbott|freestyle/i, blocks: ['xdripjs'] }
  ];

  var ecosystem = {
    name: 'ecosystem'
    , label: 'Apps'
    , pluginType: 'pill-status'
  };

  function deviceText (status) {
    return String(status && status.device ? status.device : '');
  }

  function matchSource (text, blocks, status) {
    var byName = _.find(SOURCE_RULES, function (rule) {
      return rule.match.test(text);
    });
    if (byName) {
      return byName;
    }
    return _.find(SOURCE_RULES, function (rule) {
      return _.some(rule.blocks, function (block) {
        return status && status[block];
      });
    }) || null;
  }

  function noteSource (map, rule, mills, device) {
    if (!rule) {
      return;
    }
    var existing = map[rule.key];
    if (!existing || mills >= existing.lastMills) {
      map[rule.key] = {
        label: rule.label
        , lastMills: mills
        , device: device || ''
      };
    }
  }

  function hasRecentBlock (statusList, blockName, sinceMills, sbx) {
    return _.some(statusList, function (status) {
      return status[blockName]
        && sbx.entryMills(status) <= sbx.time
        && sbx.entryMills(status) >= sinceMills;
    });
  }

  ecosystem.analyzeData = function analyzeData (sbx) {
    var recentHours = 24;
    var recentMills = sbx.time - times.hours(recentHours).msecs;
    var entryRecentMills = sbx.time - times.hours(3).msecs;

    var result = {
      apps: {}
      , cgm: { active: false, source: null, lastMills: 0, device: '' }
      , pump: { active: false, source: null, lastMills: 0, device: '' }
      , loop: { active: false, source: null, lastMills: 0, device: '' }
      , treatmentsRecent: false
      , summary: 'No uploaders'
      , level: levels.WARN
      , hints: []
    };

    var recentStatus = _.filter(sbx.data.devicestatus, function (status) {
      return sbx.entryMills(status) <= sbx.time && sbx.entryMills(status) >= recentMills;
    });

    _.forEach(recentStatus, function (status) {
      var mills = sbx.entryMills(status);
      var text = deviceText(status);
      noteSource(result.apps, matchSource(text, null, status), mills, text);

      if (status.xdripjs) {
        result.cgm.active = true;
        if (mills >= result.cgm.lastMills) {
          result.cgm.lastMills = mills;
          result.cgm.source = 'xDrip+';
          result.cgm.device = text;
        }
      }

      if (status.pump) {
        result.pump.active = true;
        if (mills >= result.pump.lastMills) {
          result.pump.lastMills = mills;
          result.pump.source = matchSource(text, ['pump'], status);
          result.pump.source = result.pump.source ? result.pump.source.label : (text || 'Pump');
          result.pump.device = text;
        }
      }

      if (status.loop || status.openaps) {
        result.loop.active = true;
        if (mills >= result.loop.lastMills) {
          result.loop.lastMills = mills;
          var loopRule = matchSource(text, ['loop', 'openaps'], status);
          result.loop.source = loopRule ? loopRule.label : (status.loop ? 'Loop' : 'OpenAPS');
          result.loop.device = text;
        }
      }
    });

    var recentEntries = _.filter(sbx.data.sgvs || sbx.data.entries || [], function (entry) {
      var mills = entry.mills || entry.date;
      return mills && mills <= sbx.time && mills >= entryRecentMills && entry.type === 'sgv';
    });

    _.forEach(recentEntries, function (entry) {
      var mills = entry.mills || entry.date;
      var text = String(entry.device || '');
      if (!result.cgm.active || mills >= result.cgm.lastMills) {
        result.cgm.active = true;
        result.cgm.lastMills = mills;
        result.cgm.device = text;
        if (/xdrip/i.test(text)) {
          result.cgm.source = 'xDrip+';
        } else if (/libre|abbott|freestyle/i.test(text)) {
          result.cgm.source = 'Libre';
        } else if (/glooko|diasend|connect/i.test(text)) {
          result.cgm.source = 'Glooko';
        } else if (text) {
          result.cgm.source = utils.deviceName(text);
        } else {
          result.cgm.source = 'CGM';
        }
      }
      noteSource(result.apps, matchSource(text, null, null), mills, text);
    });

    result.treatmentsRecent = _.some(sbx.data.treatments, function (treatment) {
      var mills = treatment.mills || (treatment.created_at ? moment(treatment.created_at).valueOf() : 0);
      return mills && mills >= recentMills && mills <= sbx.time;
    });

    if (!result.pump.active && hasRecentBlock(recentStatus, 'pump', recentMills, sbx)) {
      result.pump.active = true;
    }
    if (!result.loop.active && (hasRecentBlock(recentStatus, 'loop', recentMills, sbx) || hasRecentBlock(recentStatus, 'openaps', recentMills, sbx))) {
      result.loop.active = true;
    }

    if (!result.cgm.active) {
      result.hints.push('Enable xDrip+ Nightscout Sync for Libre 3+ glucose.');
    }
    if (!result.pump.active) {
      result.hints.push('Pump data needs AndroidAPS, CamAPS via Glooko bridge, or a pump-capable uploader.');
    }
    if (!result.loop.active) {
      result.hints.push('Loop/OpenAPS pills need AndroidAPS or nightscout-connect (Glooko) for CamAPS treatments.');
    }
    if (result.cgm.active && !result.pump.active && !result.loop.active && !result.treatmentsRecent) {
      result.hints.push('xDrip+ uploads glucose only; CamAPS temp basals are not sent to Nightscout by default.');
    }

    var parts = [];
    parts.push(result.cgm.active ? 'CGM' : 'CGM-');
    parts.push(result.loop.active ? 'Loop' : 'Loop-');
    parts.push(result.pump.active ? 'Pump' : 'Pump-');
    result.summary = parts.join('·');

    if (result.cgm.active && result.loop.active && result.pump.active) {
      result.level = levels.NONE;
    } else if (result.cgm.active) {
      result.level = levels.INFO;
    } else {
      result.level = levels.WARN;
    }

    result.appList = _.map(result.apps, function (app) {
      return app.label;
    }).sort();

    return result;
  };

  ecosystem.setProperties = function setProperties (sbx) {
    sbx.offerProperty('ecosystem', function setEcosystem () {
      return ecosystem.analyzeData(sbx);
    });
  };

  ecosystem.updateVisualisation = function updateVisualisation (sbx) {
    var data = sbx.properties.ecosystem;
    if (!data) {
      return;
    }

    var info = [];

    function pushChannel (label, channel) {
      info.push({
        label: label + ': '
        , value: channel.active
          ? ((channel.source || 'Active') + (channel.lastMills ? ' (' + moment(channel.lastMills).fromNow() + ')' : ''))
          : 'Not detected'
      });
      if (channel.device) {
        info.push({ label: '  Device: ', value: utils.deviceName(channel.device) });
      }
    }

    pushChannel('CGM', data.cgm);
    pushChannel('Loop', data.loop);
    pushChannel('Pump', data.pump);

    if (data.appList && data.appList.length) {
      info.push({ label: 'Apps seen: ', value: data.appList.join(', ') });
    }

    if (data.treatmentsRecent) {
      info.push({ label: 'Treatments: ', value: 'Recent entries in Nightscout' });
    }

    _.forEach(data.hints, function (hint) {
      info.push({ label: 'Tip: ', value: hint });
    });

    var statusClass = null;
    if (data.level === levels.WARN) {
      statusClass = 'warn';
    } else if (data.level === levels.INFO) {
      statusClass = 'warn';
    }

    sbx.pluginBase.updatePillText(ecosystem, {
      value: data.summary
      , label: translate('Apps') || 'Apps'
      , info: info
      , pillClass: statusClass
    });
  };

  return ecosystem;
}

module.exports = init;
