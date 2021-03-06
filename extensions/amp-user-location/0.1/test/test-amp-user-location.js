/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {AmpUserLocationEvent} from '../amp-user-location';
import {PositionError} from '../position-error';
import {Services} from '../../../../src/services';
import {UserLocationSource} from '../user-location';
import {toggleExperiment} from '../../../../src/experiments';

describes.realWin(
  'amp-user-location',
  {
    amp: {
      extensions: ['amp-user-location'],
    },
  },
  env => {
    let win;
    let doc;

    beforeEach(() => {
      win = env.win;
      doc = win.document;
      toggleExperiment(win, 'amp-user-location', true);
    });

    async function newUserLocation(opt_config) {
      const userLocation = doc.createElement('amp-user-location');
      userLocation.setAttribute('layout', 'nodisplay');
      doc.body.appendChild(userLocation);

      if (opt_config) {
        const configElement = win.document.createElement('script');
        configElement.setAttribute('type', 'application/json');
        if (typeof opt_config == 'string') {
          configElement.textContent = opt_config;
        } else {
          configElement.textContent = JSON.stringify(opt_config);
        }
        userLocation.appendChild(configElement);
      }

      await userLocation.build();
      await userLocation.layoutCallback();
      return userLocation;
    }

    it('should build if experiment is on', async () => {
      const element = await newUserLocation();
      expect(element.tagName).to.equal('AMP-USER-LOCATION');
    });

    it('should not build if experiment is off', async () => {
      expectAsyncConsoleError(/experiment must be enabled/);
      toggleExperiment(env.win, 'amp-user-location', false);
      await expect(newUserLocation()).to.eventually.be.rejectedWith(
        /experiment must be enabled/
      );
    });

    it('should parse config when built, if present', async () => {
      const DEFAULT_CONFIG = {
        fallback: undefined,
        maximumAge: undefined,
        precision: undefined,
        timeout: undefined,
      };
      const elementNoConfig = await newUserLocation();
      const implNoConfig = await elementNoConfig.getImpl();
      const noConfig = await implNoConfig.getConfig_();
      expect(noConfig).to.deep.equal(DEFAULT_CONFIG);

      const elementWithConfig = await newUserLocation({});
      const implWithConfig = await elementWithConfig.getImpl();
      const config = await implWithConfig.getConfig_();
      expect(config).to.deep.equal(DEFAULT_CONFIG);
    });

    it('should error with invalid config', async () => {
      expectAsyncConsoleError(/Failed to parse/);
      const element = await newUserLocation('this is not valid json');
      const impl = await element.getImpl();

      await expect(impl.getConfig_()).to.eventually.be.rejectedWith(
        'Failed to parse amp-user-location config'
      );
    });

    it('should parse recognized fields in the config', async () => {
      const testConfig = {
        fallback: '40,-22',
        maximumAge: 60000,
        precision: 'low',
        timeout: 10000,
        doNotExpose: 'wow',
      };

      const element = await newUserLocation(testConfig);
      const impl = await element.getImpl();
      const config = await impl.getConfig_();
      expect(config).to.deep.include({
        fallback: {lat: 40, lon: -22},
        maximumAge: 60000,
        timeout: 10000,
      });
      expect(config).to.not.have.property('doNotExpose');
    });

    it('should trigger the "approve" event if user approves geolocation', async () => {
      class UserLocationFake {}
      UserLocationFake.prototype.requestLocation = env.sandbox.stub().resolves({
        lat: 10,
        lon: -10,
      });
      env.sandbox
        .stub(Services, 'userLocationForDocOrNull')
        .resolves(new UserLocationFake());

      const element = await newUserLocation();
      const impl = await element.getImpl();

      const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
      await impl.userLocationInteraction_();

      expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.APPROVE, {
        lat: 10,
        lon: -10,
      });
    });

    it('should trigger the "deny" event if user denies geolocation', async () => {
      class UserLocationFake {}
      UserLocationFake.prototype.requestLocation = env.sandbox.stub().rejects({
        code: PositionError.PERMISSION_DENIED,
      });
      env.sandbox
        .stub(Services, 'userLocationForDocOrNull')
        .resolves(new UserLocationFake());

      const element = await newUserLocation();
      const impl = await element.getImpl();

      const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
      await impl.userLocationInteraction_();

      expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.DENY);
    });

    it(
      'should trigger the "deny" event with fallback if user' +
        ' denies geolocation',
      async () => {
        class UserLocationFake {}
        UserLocationFake.prototype.requestLocation = env.sandbox
          .stub()
          .withArgs({fallback: {lat: 20, lon: -20}})
          .rejects({
            code: PositionError.PERMISSION_DENIED,
            fallback: {source: UserLocationSource.FALLBACK, lat: 20, lon: -20},
          });
        env.sandbox
          .stub(Services, 'userLocationForDocOrNull')
          .resolves(new UserLocationFake());

        const element = await newUserLocation({fallback: '20,-20'});
        const impl = await element.getImpl();

        const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
        await impl.userLocationInteraction_();

        expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.DENY, {
          'fallback': {
            'source': UserLocationSource.FALLBACK,
            'lat': 20,
            'lon': -20,
          },
        });
      }
    );

    it('should trigger the "error" event if geolocation timeouts', async () => {
      class UserLocationFake {}
      UserLocationFake.prototype.requestLocation = env.sandbox.stub().rejects({
        code: PositionError.TIMEOUT,
      });
      env.sandbox
        .stub(Services, 'userLocationForDocOrNull')
        .resolves(new UserLocationFake());

      const element = await newUserLocation();
      const impl = await element.getImpl();

      const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
      await impl.userLocationInteraction_();

      expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.ERROR);
    });

    it(
      'should trigger the "error" event with fallback if ' +
        'geolocation timeouts',
      async () => {
        class UserLocationFake {}
        UserLocationFake.prototype.requestLocation = env.sandbox
          .stub()
          .withArgs({fallback: {lat: 20, lon: -20}})
          .rejects({
            code: PositionError.TIMEOUT,
            fallback: {source: UserLocationSource.FALLBACK, lat: 20, lon: -20},
          });
        env.sandbox
          .stub(Services, 'userLocationForDocOrNull')
          .resolves(new UserLocationFake());

        const element = await newUserLocation();
        const impl = await element.getImpl();

        const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
        await impl.userLocationInteraction_();

        expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.ERROR, {
          'fallback': {
            'source': UserLocationSource.FALLBACK,
            'lat': 20,
            'lon': -20,
          },
        });
      }
    );

    it('should trigger the "error" event if geolocation is unavailable', async () => {
      class UserLocationFake {}
      UserLocationFake.prototype.requestLocation = env.sandbox
        .stub()
        .rejects({code: PositionError.POSITION_UNAVAILABLE});
      env.sandbox
        .stub(Services, 'userLocationForDocOrNull')
        .resolves(new UserLocationFake());

      const element = await newUserLocation();
      const impl = await element.getImpl();

      const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
      await impl.userLocationInteraction_();

      expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.ERROR);
    });

    it(
      'should trigger the "error" event if the platform ' +
        'does not support geolocation',
      async () => {
        class UserLocationFake {}
        UserLocationFake.prototype.requestLocation = env.sandbox
          .stub()
          .rejects({code: PositionError.PLATFORM_UNSUPPORTED});
        env.sandbox
          .stub(Services, 'userLocationForDocOrNull')
          .resolves(new UserLocationFake());

        const element = await newUserLocation();
        const impl = await element.getImpl();

        const triggerSpy = env.sandbox.spy(impl, 'triggerEvent_');
        await impl.userLocationInteraction_();

        expect(triggerSpy).to.have.been.calledWith(AmpUserLocationEvent.ERROR);
      }
    );
  }
);
