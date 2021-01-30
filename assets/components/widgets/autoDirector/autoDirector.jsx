UI.scoringRules = {
	// Give a small intial edge to leaders
	'priorizeLeaders': function(score, driver, drivers) {
		score += 1-(driver.scoreInfo.positionOverall/drivers.length);

		return score;
	},
	// make sure they don't stand still
	'standingStill': function(score, driver, drivers) {
		if (driver.vehicleInfo.speed < 10) {
			score += -20;
		}

		return score;
	},
	// people running an invalid lap aren't as interesting
	'hasInvalidLaps': function(score, driver, drivers) {
		//console.log(driver.name, driver.extendedInfo.currentLapInfo.sector1);
		if (driver.extendedInfo.currentLapInfo.valid === false) {
			score += -2;
		}

		return score;
	},
	// people in yellow flag zones may be interesting, particulary those who might be cuasing it
	'causingYellowFlag': function(score, driver, drivers) {
		if (UI.state.sessionInfo.type.match(/^race/i) && driver.scoreInfo.flagInfo.yellow > 0 && driver.vehicleInfo.speed > 10 && driver.vehicleInfo.speed < 50) {
			score += 10;
		}

		return score;
	},
	// Interesting if they don't have a time already in non race
	'noBestTime': function(score, driver, drivers) {
		if (UI.state.sessionInfo.type.match(/^race/i)) {
			return score;
		}

		if (driver.scoreInfo.bestLapInfo.sector3 === -1) {
			score += 1;
		}

		return score;
	},
	// Close racing is really interesting
	'closeRacing': function(score, driver, drivers) {
		if (!UI.state.sessionInfo.type.match(/^race/i)) {
			return score;
		}

		var timeDiff = Math.max(0, driver.scoreInfo.timeDiff);
		var secondsGap = 3;
		var normalized = secondsGap*1000;

		// Give back between 0 and 2 depending on how close
		if (timeDiff > 0 && timeDiff < normalized) {
			var delta = (1-(timeDiff/normalized))*(normalized/1000);
			score += delta*2;
		}

		return score;
	},
	// If the car already has focus give it a bit of a boost,
	// the boost is based on how long we plan on keeping a shot.
	// So with 15s shot they get 15points, after 7s they get 8points.
	'alreadyHasFocus': function(score, driver, drivers) {
		if (!this.cameraChangedTimestamp) {
			return score;
		}

		var averageCameraShotLength = 15;
		if (driver.slotId === UI.state.focusedSlot) {
			var elapsed = (Date.now()-this.cameraChangedTimestamp)/1000;
			var delta = Math.max(0, averageCameraShotLength-elapsed);
			score += delta;
		}
		return score;
	},
	// Current sectors is faster then personal best
	'fasterInPrivateSectors': function(score, driver, drivers) {
		var self = this;
		if (UI.state.sessionInfo.type.match(/^race/i)) {
			return score;
		}

		var best = driver.scoreInfo.bestLapInfo;
		var current = driver.extendedInfo.currentLapInfo;
		var sectors = ['sector1', 'sector2', 'sector3'];
		sectors.forEach(function(sector, i) {
			if (
				sector === 'sector3' ||
				current[sectors[i+1]] === -1 ||
				current[sector] === -1 ||
				best[sector] === -1
			) {
				return;
			}

			if (current[sector] < best[sector]) {
				var delta = (best[sector] - current[sector])/1000;
				score += ((3-i)/2)+Math.min(1, delta);

				// Reset cam change so they keep focus after finishing sector3, less abrupt
				if (driver.slotId === UI.state.focusedSlot) {
					self.cameraChangedTimestamp = Date.now()-5*1000;
				}
			}
		});

		return score;
	},
	// Current sectors is faster then global best
	'fasterInGlobalSectors': function(score, driver, drivers) {
		var self = this;
		if (UI.state.sessionInfo.type.match(/^race/i)) {
			return score;
		}

		var best = drivers[0].scoreInfo.bestLapInfo;
		var current = driver.extendedInfo.currentLapInfo;
		var sectors = ['sector1', 'sector2', 'sector3'];
		sectors.forEach(function(sector, i) {
			if (
				sector === 'sector3' ||
				current[sectors[i+1]] === -1 ||
				current[sector] === -1 ||
				best[sector] === -1
			) {
				return;
			}

			if (current[sector] < best[sector]) {
				var delta = (best[sector] - current[sector])/1000;
				score += ((3-i)/2)+Math.min(1, delta);

				// Reset cam change so they keep focus after finishing sector3, less abrupt
				if (driver.slotId === UI.state.focusedSlot) {
					self.cameraChangedTimestamp = Date.now()-5*1000;
				}
			}
		});

		return score;
	},
	// Focus on players at the start of a race
	'focusOnPoleDuringRaceStart': function(score, driver, drivers) {
		var session = UI.state.sessionInfo;
		if (!session.type.match(/^race/i)) {
			return score;
		}

		var secondsPassed = UI.state.sessionInfo.timeTotal;
		if (secondsPassed < 20 && driver.scoreInfo.positionOverall === 1) {
			score += 30;
		}

		return score;
	},
	// Don't focus on drivers that have passed the finish line
	'passedFinishline': function(score, driver, drivers) {
		if (UI.state.sessionInfo.phase.match(/(green)/i)) {
			return score;
		}

		var currentLapsForWinner = drivers[0].scoreInfo.laps;
		if (driver.scoreInfo.laps === currentLapsForWinner) {
			score += -20;
		}


		return score;
	},
	// Weight overall score on position
	'weightOverallPosition': function(score, driver, drivers) {
		if (!UI.state.sessionInfo.type.match(/^race/i)) {
			return score;
		}
		var ratio = (((1-(driver.scoreInfo.positionClass/drivers.length))/3)+0.7);
		score += score*ratio;
		return score;
	}
};
UI.widgets.AutoDirector = React.createClass({
	// These rules are checked top to bottom, must return score
	rules: UI.scoringRules,
	activateDefaultWidgets: function() {
		if (UI.state.controllerOptions.options.autoDirectorOnlyMode.value === "false") {
			UI.state.activeWidgets.MulticlassStandings.active = true;
			UI.state.activeWidgets.LogoOverlay.active = true;
			UI.state.activeWidgets.SessionInfo.active = true;
			UI.state.activeWidgets.Alert.active = true;
		}
	},
	usedCockpitCam: false,
	usedCockpitTimeout: null,
	cameraChangedTimestamp: Date.now(),
	componentWillMount: function() {
		var self = this;
		self.activateDefaultWidgets();
		io.emit('setState', UI.state);

		function updateInfo() {
			r3e.getDriversInfo(function(data) {
				var jobs = [];
				data.driversInfo.forEach(function(driver) {
					jobs.push(function(done) {
						UI.batch({
							'vehicleInfo': function(done) {
								r3e.getVehicleInfo({
									'slotId': driver.slotId
								}, done);
							},
							'pitInfo': function(done) {
								r3e.getPitInfo({
									'slotId': driver.slotId
								}, done);
							},
							'extendedInfo': function(done) {
								r3e.getExtendedInfo({
									'slotId': driver.slotId
								}, done);
							}
						}, function(data) {
							driver.pitInfo = data.pitInfo;
							driver.vehicleInfo = data.vehicleInfo;
							driver.extendedInfo = data.extendedInfo;
							done(driver);
						});

					});
				});

				// Find out which one should get the focus
				UI.batch(jobs, function(drivers) {
					var focusedSlot = 0;
					var camera = UI.state.camera;

					// Default to showing #1 driver
					if (drivers[0]) {
						focusedSlot = drivers[0].slotId;
					}

					var possibleDrivers = [];
					var logs = [];
					drivers.forEach(function(driver) {
						var points = 0;
						var log = [];
						log.push('Driver: '+driver.name+' (#'+driver.scoreInfo.positionOverall+')');
						Object.keys(self.rules).forEach(function(key) {
							var rule = self.rules[key];
							var prePoint = points;
							points = rule.bind(self)(points, driver, drivers);
							var delta = points-prePoint;
							if (delta) {
								log.push('  - '+key+': '+delta.toFixed(2));
							}
						});
						log.push('Total: '+points.toFixed(2)+'\n');
						logs.push([log, points])
						possibleDrivers.push({
							'score': points,
							'slotId': driver.slotId,
							'driver': driver
						});
					});

					// Sort based on score from the rules
					possibleDrivers = possibleDrivers.sort(function(a, b) {
						if (a.score > b.score) {
							return -1;
						} else if (b.score > a.score) {
							return 1;
						} else {
							return 0;
						}
					});

					if (possibleDrivers.length) {
						focusedSlot = possibleDrivers[0].slotId;

						// change to hood cam if driver is close
						var timeDiff = possibleDrivers[0].driver.scoreInfo.timeDiff;
						var sinceLastCamChange = (Date.now()-self.cameraChangedTimestamp)/1000;
						var moreThenTenSeconds = sinceLastCamChange > 10;
						if (moreThenTenSeconds) {
							if (
								!self.usedCockpitCam &&
								timeDiff !== -1 &&
								timeDiff < 300
							) {
								camera = 'onboard1';
								self.usedCockpitCam = true;
								if (self.usedCockpitTimeout) {
									clearTimeout(self.usedCockpitTimeout);
								}
								self.usedCockpitTimeout = setTimeout(function() {
									self.usedCockpitCam = false;
								}, 60*1000);
							} else {
								camera = 'trackside';
							}
						}
					} else {
						camera = 'trackside';
						focusedSlot = 0;
					}

					// Don't update if they are already the same
					if (UI.state.focusedSlot === focusedSlot && UI.state.camera === camera) {
						return;
					}
					UI.state.focusedSlot = focusedSlot;

					// Don't go from hood to hood
					if (UI.state.camera === 'onboard1') {
						camera = 'trackside';
					}
					UI.state.camera = camera;

					// set the state and update camera
					io.emit('setState', UI.state);
					io.emit('updatedCamera', {
						'automated': true
					});

					self.cameraChangedTimestamp = Date.now();
				});
			});
		}
		updateInfo();

		self.updateInterval = setInterval(updateInfo, 1*500);
	},
	componentWillUnmount: function() {
		clearInterval(this.updateInterval);
	},
	render: function() {
		return (null);
	}
});
