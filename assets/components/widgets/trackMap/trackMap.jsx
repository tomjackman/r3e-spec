UI.widgets.TrackMap = React.createClass({
	componentDidMount: function() {
		var self = this;
		// self.refs is = {} at first
		(function tick() {
			if (!self.refs.svg) {
				return setTimeout(tick, 100);
			}
			self.setupSvg();
		})();
	},
	setupSvg: function() {
		var self = this;
		var svg = self.refs.svg;
		var svgDoc = svg.contentDocument;
		var svgEl = svgDoc.querySelector('svg');
		var path = svgDoc.querySelector('path');
		if (!path || !path.style) {
			return;
		}
		path.style.stroke = '#fff';
		path.style.strokeWidth = '2px';
		self.refs.container.classList.add('loaded');

		self.state.svg.loaded = true;
		self.state.svg.path = path;
		self.state.svg.el = svgEl;
		self.setState(self.state);
		self.resizeToFill();
	},
	windowResize: null,
	componentWillMount: function() {
		window.addEventListener('resize', this.resizeToFill, false);
		var self = this;

		function updateInfo() {
			r3e.getDriversInfo(function(driversInfo) {
				var jobs = [];
				var driverData = driversInfo.driversInfo;
				driverData.forEach(function(driver) {
					jobs.push(function(done) {
						r3e.getVehicleInfo({
						    'slotId': driver.slotId
						}, function(vehicleInfo) {
							driver.vehicleInfo = vehicleInfo;
							done(driver);
						});
					});
				});
				UI.batch(jobs, function(data) {
					self.setState({
						'driversInfo': data
					});
				});
			});
		}
		updateInfo();

		self.updateInterval = setInterval(updateInfo, UI.spectatorUpdateRate);
	},
	componentWillUnmount: function() {
		window.removeEventListener('resize', this.resizeToFill, false);
		clearInterval(this.updateInterval);
	},
	resizeToFill: function() {
		var self = this;
		if (!self.state.svg.el) {
			// Hide widgets if we fail loading
			UI.state.activeWidgets.TrackMap.active = false;
			io.emit('setState', UI.state);
			return;
		}

		var width = self.state.svg.el.getAttribute('width');
		var height = self.state.svg.el.getAttribute('height');

		var widthRatio = window.innerWidth / width;
		var heightRatio = window.innerHeight / height;

		var ratio = Math.min(widthRatio, heightRatio)*0.95;

		var containerEl = self.refs.container;
		containerEl.style.width = width+'px';
		containerEl.style.height = height+'px';
		containerEl.style.webkitTransform = 'scale('+ratio+') translate(-50%, -50%)';
	},
	getInitialState: function() {
		return {
			'svg': {
				'path': null,
				'el': null,
				'loaded': false
			}
		};
	},
	getTimeTrapStyle: function(progress) {
		var svg = this.state.svg;
		if (!svg.path) {
			return {
				'display': 'none'
			};
		}

		var totalLength = svg.path.getTotalLength();
		var point = svg.path.getPointAtLength(totalLength*progress);
		return {
			'WebkitTransform': 'translate('+point.x+'px, '+point.y+'px) scale(0.4)'
		};
	},
	looper: Array.apply(null, Array(UI.maxDriverCount)).map(function(){}),
	render: function() {
		var self = this;
		var p = this.state;
		if (!this.state.driversInfo) {
			return null;
		}

		var drivers = this.state.driversInfo;
		var driversLookup = {};
		drivers.forEach(function(driver) {
			driversLookup[driver.slotId] = driver;
		});

		return (
			<div className="track-map-bg">
				<div className="track-map" ref="container">
					<object data={'/img/trackmaps/'+UI.state.eventInfo.layoutId+'.svg'} type="image/svg+xml" ref="svg" id="svgObject" width="512px" height="512px"></object>
					{self.looper.map(function(non, i) {
						if (self.state.svg.loaded && driversLookup[i]) {
							return <TrackMapDot key={i} svg={self.state.svg} driver={driversLookup[i]}/>
						}
						else {
							return null;
						}
					})}
					<div
						onClick={self.onClick}
						className="dot start"
						style={self.getTimeTrapStyle(0)}>
							<span className="name">Start/Finish line</span>
					</div>
				</div>
			</div>
		);
	}
});
var TrackMapDot = React.createClass({
	getClassColor: function(classId) {
		var self = this;
		var classColour = "rgba(38, 50, 56, 0.8)";

		if (r3eData.classes[classId] != null && r3eClassColours.classes[classId] != null) {
			classColour = r3eClassColours.classes[classId].colour;
		}

		return classColour;
	},
	getStyles: function(driver) {
		return cx({
			'dot': true,
			'active': driver.slotId === UI.state.focusedSlot,
			'leader': driver.scoreInfo.positionClass === 1,
			'idle': driver.vehicleInfo.speed < 5
		});
	},
	getDriverStyle: function(driver) {
		var self = this;
		var svg = this.props.svg;
		var width = svg.el.clientWidth;
		var height = svg.el.clientHeight;

		var widthRatio = window.innerWidth / width;
		var heightRatio = window.innerHeight / height;

		var trackLength = UI.state.eventInfo.length;
		var totalLength = svg.path.getTotalLength();

		var progress = (driver.scoreInfo.distanceTravelled%trackLength/trackLength);

		var point = svg.path.getPointAtLength(totalLength*progress);

		return {
			'WebkitTransform': 'translate('+point.x+'px, '+point.y+'px) scale(0.3)',
			'background': self.getClassColor(driver.classId)
		};
	},
	getClass: function(driver) {
		var self = this;
		return {
			'background': self.getClassColor(driver.classId)
		};
	},
	render: function() {
		var self = this;
		var driver = this.props.driver;
		return (
			<div
			className={self.getStyles(driver)}
			style={self.getDriverStyle(driver)}>
			<div className="vehicle">
				<img src={'http://game.raceroom.com/store/image_redirect?id='+driver.liveryId+'&size=small'} height="120px" width="220px" />
			</div>

				<div className="position" style={self.getClass(driver)}>
				{driver.scoreInfo.positionClass}
				</div>

				<div className="driverName">{driver.name}</div>

				<div className="manufacturer">
					<img src={'/img/manufacturers/'+driver.manufacturerId+'.webp'} />
				</div>
			</div>




		);
	}
});
