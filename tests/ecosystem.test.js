'use strict';

const should = require('should');
const helper = require('./inithelper')();

describe('ecosystem', function () {

  const ctx = helper.ctx;
  const ecosystem = require('../lib/plugins/ecosystem')(ctx);

  function sbxWith (devicestatus, extras) {
    extras = extras || {};
    return {
      time: Date.now()
      , entryMills: function entryMills (status) {
        return status.mills;
      }
      , data: {
        devicestatus: devicestatus
        , sgvs: extras.sgvs || []
        , entries: extras.entries || extras.sgvs || []
        , treatments: extras.treatments || []
      }
    };
  }

  it('detects xDrip CGM-only uploads', function () {
    var now = Date.now();
    var data = ecosystem.analyzeData(sbxWith([
      { mills: now - 60000, device: 'xDrip+ OnePlus', xdripjs: { state: 7, timestamp: now - 60000 } }
      , { mills: now - 120000, device: 'xDrip+ OnePlus', uploader: { battery: 80 } }
    ]));

    data.cgm.active.should.equal(true);
    data.cgm.source.should.equal('xDrip+');
    data.pump.active.should.equal(false);
    data.loop.active.should.equal(false);
    data.summary.should.containEql('CGM');
    data.hints.length.should.be.greaterThan(0);
  });

  it('detects AndroidAPS pump and loop blocks', function () {
    var now = Date.now();
    var data = ecosystem.analyzeData(sbxWith([
      {
        mills: now - 30000
        , device: 'AndroidAPS'
        , pump: { reservoir: 80, clock: new Date(now - 30000).toISOString() }
        , openaps: { iob: { iob: 0.5, timestamp: now - 30000 } }
        , loop: { name: 'AndroidAPS', timestamp: new Date(now - 30000).toISOString() }
      }
    ]));

    data.pump.active.should.equal(true);
    data.loop.active.should.equal(true);
    data.apps.aaps.should.be.ok();
    data.summary.should.containEql('Loop');
    data.summary.should.containEql('Pump');
  });

  it('detects CamAPS device name', function () {
    var now = Date.now();
    var data = ecosystem.analyzeData(sbxWith([
      { mills: now - 45000, device: 'CamAPS FX', openaps: { enacted: { timestamp: now - 45000 } } }
    ]));

    data.apps.camaps.should.be.ok();
    data.loop.active.should.equal(true);
  });

});
