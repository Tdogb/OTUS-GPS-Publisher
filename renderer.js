const { SerialPort } = require('serialport')
const GPS = require('gps');
// const db = require('mongo')
const Readline = require('@serialport/parser-readline');
let selectedPort = null;
let reader = null;
let writer = null;
let isReading = false;
let serialPortCurrent = null;
const portSelect = document.getElementById('port-select');
const refreshButton = document.getElementById('refresh');
const baudRateInput = document.getElementById('baud-rate');
const openPortButton = document.getElementById('open-port');
const closePortButton = document.getElementById('close-port');
const consoleDiv = document.getElementById('console');
const gpsInfo = document.getElementById('gps_info');
const gps = new GPS;
var hdop = 0;
var pdop = 0;
var sats = 0;
let lattitude = 0;
let longitude = 0;
let altitude = 0;

const redis = require('redis');
const publisher = redis.createClient();
(async () => {
    await publisher.connect();
})();

async function listSerialPorts() {
  await SerialPort.list().then((ports, err) => {
    if(err) {
      appendToConsole(err.message);
      return
    }
    console.log('ports', ports);

    portSelect.innerHTML = '';
    ports.forEach((port) => {
      const option = document.createElement('option');
      option.value = port.path;
      if (port.manufacturer != undefined) {
        option.textContent = port.path + ' (' + port.manufacturer + ')';
        let lowercase_mfg = port.manufacturer.toLowerCase();
        if (lowercase_mfg.includes("u-blox") || lowercase_mfg.includes("ublox") || lowercase_mfg.includes("nmea") || lowercase_mfg.includes("gps")) {
          selectedPort = port;
          selectedPortName = port.path;
          openPortButton.disabled = false;
        }
      } else {
        option.textContent = port.path;
      }
      portSelect.appendChild(option);
    });
    portSelect.value = selectedPort.path;
  })
}

async function openSerialPort() {
    const baudRate = parseInt(baudRateInput.value) || 4800;
    if (selectedPort && baudRate) {
        try {
            console.log("selectedport");
            console.log(selectedPort);
            console.log(baudRateInput.value);
            serialPortCurrent = new SerialPort({path: selectedPortName, baudRate: baudRate});

            serialPortCurrent.on('open', () => {
                appendToConsole('Port is open.');
                serialPortCurrent.on('data', (data) => {
                    // Split the string by newline characters
                    const lines = data.toString().split('\n');

                    // Iterate through each line and log it to the console
                    lines.forEach((line, index) => {
                        // console.log(`Line ${index + 1}: ${line}`);
                        gps.update(line);
                    });
                    // console.log('Data received:', data.toString());
                });
            });
        
            serialPortCurrent.on('error', (err) => {
                appendToConsole(err.message);
            });

            appendToConsole(`Port opened at baud rate: ${baudRate}`);
            openPortButton.disabled = true;
            closePortButton.disabled = false;
            refreshButton.disabled = true;
            // readFromSerialPort();
        } catch (error) {
            appendToConsole('Error opening port: ' + error);
        }
    }
}



// Function to close the serial port
async function closeSerialPort() {
    try {
        serialPortCurrent.close(function (err) {
            console.log('Port closed', err);
        });
        appendToConsole('Port closed');
        closePortButton.disabled = true;
        openPortButton.disabled = false;
        refreshButton.disabled = false;
        isReading = false;
    } catch (error) {
        appendToConsole('Error closing port: ' + error);
    }
}

function appendToConsole(message) {
  consoleDiv.textContent += message + "\n";
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

  // Allow user to manually select a serial port
  portSelect.addEventListener('change', () => {
    const selectedOption = portSelect.options[portSelect.selectedIndex];
    if (selectedOption.value) {
        selectedPort = selectedOption.value;
        openPortButton.disabled = false;
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', async () => {
    if (selectedPort) {
        await closeSerialPort();
    }
});

gps.on('data', parsed => {
    console.log(parsed);
    if (parsed.type == "GSA") {
        pdop = parsed.pdop;
        hdop = parsed.hdop;
        gpsInfo.innerHTML = 'hdop: ' + hdop + ' pdop: ' + pdop + ' sats: ' + sats;
    } else if (parsed.type == "GSV") {
        sats = parsed.satsInView;
        gpsInfo.innerHTML = 'hdop: ' + hdop + ' pdop: ' + pdop + ' sats: ' + sats;
    }
    if (parsed.lat != null && parsed.lon != null && parsed.alt != null) {
        lattitude = parsed.lat;
        longitude = parsed.lon;
        altitude = parsed.alt;
        (async () => {
            if (lattitude != 0 && longitude != 0) {
                const swiftie_state = {
                    id: '9999',
                    type: 'Car',
                    time_gcs: Date(),
                    time_ms_boot_drone: Date(),
                    lat: lattitude,
                    lon: longitude,
                    alt_msl: altitude,
                    vel_x: 0,
                    vel_y: 0,
                    vel_z: 0,
                };
                // db_package = {
                //     "id": self.id,
                //     "type": "testdrone",
                //     "time_gcs": datetime.now(),
                //     "time_ms_boot_drone": self.drone_time_ms,
                //     "lat": self.lat,
                //     "lon": self.lon,
                //     "alt_msl": self.alt,
                //     "vel_x": self.vel_x,
                //     "vel_y": self.vel_y,
                //     "vel_z": self.vel_z, 
                // }
                await publisher.publish('CarState', JSON.stringify(swiftie_state));
                appendToConsole("Lat: " + lattitude.toFixed(6) + " Lon: " + longitude.toFixed(6) + " Alt: " + altitude);
            }
        })();
    }
});

openPortButton.addEventListener('click', openSerialPort);
closePortButton.addEventListener('click', closeSerialPort);
refreshButton.addEventListener('click', listSerialPorts);

listSerialPorts()