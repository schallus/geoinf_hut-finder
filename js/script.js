var map;
var mapBoxAccessToken = "pk.eyJ1Ijoic2NoYWxsdXMiLCJhIjoiY2l5NGJnaGk4MDAwbjJ3cWhjZjRmbGI0bSJ9.XWDjAgk-lP5mtZVagOCoag";

// Features styles
var styleHut = new ol.style.Style({
    image: new ol.style.Icon({
        opacity: 0.8,
        src:'img/hut-icon.png',
        scale:0.5
    })
});

var styleCentre = new ol.style.Style({
    image: new ol.style.RegularShape({
        fill: new ol.style.Fill({color: '#9d5145'}),
        stroke: new ol.style.Stroke({color: '#9d5145', width: 2}),
        points: 4,
        radius: 10,
        radius2: 0,
        angle: 0
    })
});

var styleBuffer = new ol.style.Style({
    stroke: new ol.style.Stroke({
        color: '#9d5145',
        width: 2
    })
});

// Create OpenLayer map
map = new ol.Map({
    target: 'map'
});

// Add a MapBox layer to the map
var mapboxLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: 'https://api.mapbox.com/styles/v1/schallus/cjb6lw8pd2q1k2smqx2jvyf3e/tiles/256/{z}/{x}/{y}?access_token='+mapBoxAccessToken
    })
});
map.addLayer(mapboxLayer);

// var swissTopoLayer = ga.layer.create('ch.swisstopo.pixelkarte-farbe');
// map.addLayer(swissTopoLayer);

// Add a vector layer which will contain the center, the buffer and the huts
var vectorLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style:styleHut
});
map.addLayer(vectorLayer);

// Init the map view
var view = new ol.View({projection: "EPSG:3857"});
var cbox = [924580, 5919280];
view.setCenter(cbox);
view.setZoom(5);
map.setView(view);

// On form submit, we send a geocoding request to MapBox API
$("#formSearch").submit(function (e) {
    e.preventDefault();
    var searchText = $('#inputSearchText').val();
    geocode(searchText);
});

// Query the MapBox API to retieve feature
function geocode(searchText) {
    var url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + searchText + ".json?access_token="+ mapBoxAccessToken;

    $.ajax({
        url: url,
    }).done(function(data) {
        var newFeature = data.features[0];
        addFeature(newFeature);
    }).fail(function(e) {
        console.error("Geocoding error: " + e);
    });
}

function addFeature(newFeature) {
    var feature = {
        name: newFeature.place_name,
        longitude: newFeature.geometry.coordinates[0],
        latitude: newFeature.geometry.coordinates[1]
    }

	// Create and add the center feature to our vectorLayer
    var point = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.transform([feature.longitude, feature.latitude], "EPSG:4326", "EPSG:3857")),
        name: feature.name,
        type: 'centre'
    });
    point.setStyle(styleCentre);
    vectorLayer.getSource().clear();
    vectorLayer.getSource().addFeature(point);

    // Define buffer radius
    var radius = 50000;
    if(!isNaN($('#inputRadius').val())) {
        radius = parseInt($('#inputRadius').val())*1000;
    }

    // Create buffer with the given radius
    var buffer = addBuffer(point, radius);

    var bufferGeometry = buffer.getGeometry();

    // Center the map so that the buffer fits entirely inside the map box
    centerMap(bufferGeometry);

    // Filter the huts which are inside the buffer
    filterHuts(bufferGeometry);
}

function addBuffer(feature, radius) {
    var parser = new jsts.io.OL3Parser();
    var jstsGeom = parser.read(feature.getGeometry());
    var buffered = jstsGeom.buffer(radius);
    var buffer = new ol.Feature();
    buffer.setGeometry(parser.write(buffered));
    buffer.setStyle(styleBuffer);
    buffer.set('type', 'buffer');
    vectorLayer.getSource().addFeature(buffer);
    return buffer;
}

function centerMap(geometry) {
   var view = map.getView();
    view.fit(geometry, map.getSize());
}

function filterHuts(geometry) {
    $.ajax({
        dataType: "json",
        url: "data/cabanes.geojson"
    }).done(function(data) {
        var filteredFeatures = data.features.filter(function(feature) {
            var point = ol.proj.transform([feature.geometry.coordinates[0], feature.geometry.coordinates[1]], "EPSG:4326", "EPSG:3857");
            var featuresAtPoint = vectorLayer.getSource().getFeaturesAtCoordinate(point);
            return featuresAtPoint.length>0 && featuresAtPoint[0].get('type') == 'buffer';
        });
        data.features = filteredFeatures;
        var geojsonFormat = new ol.format.GeoJSON({
            featureProjection:"EPSG:3857"
        });
        var features = geojsonFormat.readFeatures(data);
        displayHuts(features);
    }).fail(function(e) {
        console.error("Error fetching huts from GeoJSON : " + e);
    });
}

function displayHuts(features) {
    var vectorSource = vectorLayer.getSource();
    vectorSource.addFeatures(features);
    vectorSource.refresh();
}

$(map.getViewport()).on("click", function(e) {
	//if click on a hut, display informations
	$('#hutInfos').empty();
	var boolHuts = false;
    map.forEachFeatureAtPixel(map.getEventPixel(e), function (feature, layer) {
        if(feature.get('module')=='huts') {
            boolHuts = true;
            console.log("c'est une cabane");
            var hut = $('<div class="hut">');
            var hutTitle = $('<span class="hutTitle">').html(feature.get('title'));
            hut.append(hutTitle);
            var hutElevation = $('<span class="hutElevation">').text('(alt. ' + feature.get('elevation') + 'm)');
            hut.append(hutElevation);
            $('#hutInfos').append(hut);
        }
    });

    if(!boolHuts) {
        //re-center buffer
        var p = map.getEventPixel(e);
        var c = map.getCoordinateFromPixel(p);
        var coord = new ol.geom.Point(ol.proj.transform([c[0], c[1]], "EPSG:3857", "EPSG:4326"));
        var event_place = {
            place_name: "",
            geometry: {
                type: "Point",
                coordinates: [coord.flatCoordinates[0], coord.flatCoordinates[1]]
            }
        };
        addFeature(event_place);
    }
});