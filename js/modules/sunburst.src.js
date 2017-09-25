/**
 * (c) 2016 Highsoft AS
 * Authors: Jon Arild Nygard
 *
 * License: www.highcharts.com/license
 *
 * This is an experimental Highcharts module which enables visualization
 * of a word cloud.
 */
'use strict';
import H from '../parts/Globals.js';
import '../mixins/centered-series.js';
import drawPoint from '../mixins/draw-point.js';
import mixinTreeSeries from '../mixins/tree-series.js';
import '../parts/Series.js';
import './treemap.src.js';
var CenteredSeriesMixin = H.CenteredSeriesMixin,
	each = H.each,
	extend = H.extend,
	getCenter = CenteredSeriesMixin.getCenter,
	getStartAndEndRadians = CenteredSeriesMixin.getStartAndEndRadians,
	grep = H.grep,
	isString = H.isString,
	merge = H.merge,
	noop = H.noop,
	pick = H.pick,
	rad2deg = 180 / Math.PI,
	Series = H.Series,
	seriesType = H.seriesType,
	seriesTypes = H.seriesTypes,
	setTreeValues = mixinTreeSeries.setTreeValues,
	reduce = H.reduce;

var layoutAlgorithm = function layoutAlgorithm(parent, children) {
	var startAngle = parent.start,
		range = parent.end - startAngle,
		total = parent.val,
		x = parent.x,
		y = parent.y,
		innerRadius = parent.r,
		outerRadius = innerRadius + parent.radius;

	return reduce(children || [], function (arr, child) {
		var percentage = (1 / total) * child.val,
			radians = percentage * range,
			values = {
				x: x,
				y: y,
				innerR: innerRadius,
				r: outerRadius,
				radius: parent.radius,
				start: startAngle,
				end: startAngle + radians
			};
		arr.push(values);
		startAngle = values.end;
		return arr;
	}, []);
};

/**
 * getEndPoint - Find a set of coordinates given a start coordinates, an angle,
 *     and a distance.
 *
 * @param  {number} x Start coordinate x
 * @param  {number} y Start coordinate y
 * @param  {number} angle Angle in radians
 * @param  {number} distance Distance from start to end coordinates
 * @return {object} Returns the end coordinates, x and y.
 */
var getEndPoint = function getEndPoint(x, y, angle, distance) {
	return {
		x: x + (Math.cos(angle) * distance),
		y: y + (Math.sin(angle) * distance)
	};
};

var setShapeArgs = function setShapeArgs(parent, parentValues) {
	var childrenValues = [],
		// Collect all children which should be included
		children = grep(parent.children, function (n) {
			return n.visible;
		});
	childrenValues = layoutAlgorithm(parentValues, children);
	each(children, function (child, index) {
		var values = childrenValues[index],
			angle = values.start + ((values.end - values.start) / 2),
			radius = values.innerR + ((values.r - values.innerR) / 2),
			center = getEndPoint(values.x, values.y, angle, radius),
			val = (
				child.val ?
				(
					child.childrenTotal > child.val ?
					child.childrenTotal :
					child.val
				) :
				child.childrenTotal
			);
		child.shapeArgs = merge(values, {
			plotX: center.x,
			plotY: center.y
		});
		child.values = merge(values, {
			val: val
		});
		// If node has children, then call method recursively
		if (child.children.length) {
			setShapeArgs(child, child.values);
		}
	});
};

var getDrillId = function getDrillId(point, idRoot, mapIdToNode) {
	var drillId = point.id,
		node;
	// When it is the root node, the drillId should be set to parent.
	if (idRoot === point.id) {
		node = mapIdToNode[idRoot];
		drillId = node.parent;
	}
	return drillId;
};

/**
 * A Sunburst displays hierarchical data, where a level in the hierarchy is represented by a circle.
 * The center represents the root node of the tree.
 * The visualization bear a resemblance to both treemap and pie charts.
 *
 * @extends {plotOptions.pie}
 * @excluding allAreas, center, clip, colorAxis, compare, compareBase, dataGrouping, depth, endAngle, gapSize, gapUnit, ignoreHiddenPoint, innerSize, joinBy, legendType, linecap, minSize, navigatorOptions, pointRange, slicedOffset
 * @product highcharts
 * @optionparent plotOptions.sunburst
 */
var sunburstOptions = {
	/**
	 * The center of the sunburst chart relative to the plot area. Can be
	 * percentages or pixel values.
	 *
	 * @type {Array<String|Number>}
	 * @sample {highcharts} highcharts/plotoptions/pie-center/ Centered at 100, 100
	 * @default ['50%', '50%']
	 * @product highcharts
	 */
	center: ['50%', '50%'],
	/**
	 * @extends plotOptions.series.dataLabels
	 * @excluding align,allowOverlap,staggerLines,step
	 * @product highcharts
	 */
	dataLabels: {
		defer: true,
		style: {
			textOverflow: 'ellipsis'
		}
	},
	/**
	 * Which point to use as a root in the visualization.
	 *
	 * @type {String|undefined}
	 * @default undefined
	 * @since 6.0.0
	 * @product highcharts
	 * @apioption plotOptions.sunburst.rootId
	 */
	rootId: undefined
	// TODO support colorAxis
};

/**
 * Properties of the Sunburst series.
 */
var sunburstSeries = {
	drawDataLabels: noop, // drawDataLabels is called in drawPoints
	drawPoints: function drawPoints() {
		var series = this,
			group = series.group,
			hasRendered = series.hasRendered,
			idRoot = series.rootNode,
			idPreviousRoot = series.idPreviousRoot,
			nodeMap = series.nodeMap,
			nodePreviousRoot = nodeMap[idPreviousRoot],
			points = series.points,
			radians = series.startAndEndRadians,
			options = series.options,
			animation = options.animation,
			innerR = series.center[3] / 2,
			renderer = series.chart.renderer;
		each(points, function (point) {
			var node = point.node,
				shape = node.shapeArgs || {},
				rotationRad = (shape.end - (shape.end - shape.start) / 2),
				// Data labels should not rotate beyond 180 degrees.
				rotation = (rotationRad * rad2deg) % 180,
				attrStyle = series.pointAttribs(point, point.selected && 'select'),
				attrAnimation = point.graphic ? {} : {
					end: shape.end,
					innerR: shape.innerR,
					r: shape.r,
					start: shape.end,
					x: shape.x,
					y: shape.y
				},
				visible = node.visible && node.shapeArgs,
				animate,
				attr = extend(attrAnimation, attrStyle);
			if (animation) {
				animate = {
					end: shape.end,
					start: shape.start,
					innerR: shape.innerR,
					r: shape.r
				};
				if (!hasRendered) {
					attr.end = attr.start = radians.start;
				} else if (point.graphic) {
					delete attr.end;
					delete attr.start;
				} else if (nodePreviousRoot) {
					if (idRoot === point.id) {
						attr.start = radians.start;
						attr.end = radians.end;
					} else if (nodePreviousRoot.shapeArgs) {
						if (nodePreviousRoot.shapeArgs.end <= shape.start) {
							attr.end = attr.start = radians.end;
						} else {
							attr.end = attr.start = radians.start;
						}
					}
					// Animate from center and outwards.
					attr.innerR = attr.r = innerR;
				}
			}
			extend(point, {
				tooltipPos: [shape.plotX, shape.plotY],
				drillId: getDrillId(point, idRoot, nodeMap),
				name: point.name || point.id || point.index,
				plotX: shape.plotX, // used for data label position
				plotY: shape.plotY, // used for data label position
				value: node.val,
				isNull: !visible // used for dataLabels & point.draw
			});

			// Set width and rotation for data labels.
			point.dlOptions = merge({
				rotation: rotation,
				style: {
					width: shape.radius
				}
			}, point.options.dataLabels);
			point.draw({
				animation: animate,
				animationOptions: animation,
				attr: attr,
				group: group,
				renderer: renderer,
				shapeType: 'arc',
				shapeArgs: shape
			});
		});
		// Draw data labels after points
		// TODO draw labels one by one to avoid addtional looping
		Series.prototype.drawDataLabels.call(series);
	},
	pointAttribs: seriesTypes.column.prototype.pointAttribs,
	translate: function translate() {
		var series = this,
			options = series.options,
			positions = series.center = getCenter.call(series),
			radians = series.startAndEndRadians = getStartAndEndRadians(options.startAngle, options.endAngle),
			innerRadius = positions[3] / 2,
			outerRadius = positions[2] / 2,
			idRoot = series.rootNode = pick(series.rootNode, options.rootId, ''),
			idTop,
			mapIdToNode,
			nodeRoot,
			nodeTop,
			radiusPerLevel,
			tree,
			values;

		// Call prototype function
		Series.prototype.translate.call(series);
		// Create a object map from level to options
		series.levelMap = reduce(series.options.levels || [],
			function (arr, item) {
				arr[item.level] = item;
				return arr;
			}, {});
		// @todo Only if series.isDirtyData is true
		tree = series.tree = series.getTree();
		mapIdToNode = series.nodeMap;
		nodeRoot = mapIdToNode[idRoot];
		idTop = isString(nodeRoot.parent) ? nodeRoot.parent : '';
		nodeTop = mapIdToNode[idTop];
		// TODO Try to combine setTreeValues & setColorRecursive to avoid
		//  unnecessary looping.
		setTreeValues(tree, {
			idRoot: idRoot,
			levelIsConstant: series.levelIsConstant,
			mapIdToNode: mapIdToNode,
			points: series.points
		});
		series.setColorRecursive(series.tree);
		radiusPerLevel = (outerRadius - innerRadius) / nodeTop.height;
		values = mapIdToNode[''].shapeArgs = {
			end: radians.end,
			r: innerRadius,
			radius: radiusPerLevel,
			start: radians.start,
			val: nodeTop.val,
			x: positions[0],
			y: positions[1]
		};
		setShapeArgs(nodeTop, values);
	},

	/**
	 * Animate the slices in. Similar to the animation of polar charts.
	 */
	animate: function (init) {
		var chart = this.chart,
			center = [
				chart.plotWidth / 2,
				chart.plotHeight / 2
			],
			plotLeft = chart.plotLeft,
			plotTop = chart.plotTop,
			attribs, 
			group = this.group;

		// Initialize the animation
		if (init) {

			// Scale down the group and place it in the center
			attribs = {
				translateX: center[0] + plotLeft,
				translateY: center[1] + plotTop,
				scaleX: 0.001, // #1499
				scaleY: 0.001,
				rotation: 10,
				opacity: 0.01
			};

			group.attr(attribs);

		// Run the animation
		} else {
			attribs = {
				translateX: plotLeft,
				translateY: plotTop,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				opacity: 1
			};
			group.animate(attribs, this.options.animation);

			// Delete this function to allow it only once
			this.animate = null;
		}
	}
};

/**
 * Properties of the Sunburst series.
 */
var sunburstPoint = {
	draw: drawPoint,
	shouldDraw: function shouldDraw() {
		var point = this;
		return !point.isNull;
	}
};

/**
 * A `sunburst` series. If the [type](#series.sunburst.type) option is
 * not specified, it is inherited from [chart.type](#chart.type).
 * 
 * For options that apply to multiple series, it is recommended to add
 * them to the [plotOptions.series](#plotOptions.series) options structure.
 * To apply to all series of this specific type, apply it to [plotOptions.
 * sunburst](#plotOptions.sunburst).
 * 
 * @type {Object}
 * @extends plotOptions.sunburst
 * @excluding dataParser,dataURL,stack
 * @product highcharts
 * @apioption series.sunburst
 */

/** 
 * @type {Array<Object|Number>}
 * @extends series.treemap.data
 * @excluding x,y
 * @product highcharts
 * @apioption series.sunburst.data
 */

/**
* The value of the point, resulting in a relative area of the point
* in the sunburst.
* 
* @type {Number}
* @default undefined
* @since 6.0.0
* @product highcharts
* @apioption series.sunburst.data.value
*/

/**
 * Use this option to build a tree structure. The value should be the id of the
 * point which is the parent. If no points has a matching id, or this option is
 * undefined, then the parent will be set to the root.
 * 
 * @type {String|undefined}
 * @default undefined
 * @since 6.0.0
 * @product highcharts
 * @apioption series.treemap.data.parent
 */
seriesType(
	'sunburst',
	'treemap',
	sunburstOptions,
	sunburstSeries,
	sunburstPoint
);