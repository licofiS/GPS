require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const moment = require('moment');
const QRCode = require('qrcode');
const cors = require('cors');
const bodyParser = require('body-parser');
const router = express.Router();

const app = express();

app.use(cors());
app.use(express.json());  
app.use(bodyParser.json());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let bookings = [];

// Endpoint to handle bookings and generate QR codes
app.post('/book', async (req, res) => {
    const { userId, parkingSpaceId, date, time } = req.body;
    const bookingId = `${userId}-${Date.now()}`;  // Simple unique ID for demonstration
    const bookingDetails = {
        userId,
        parkingSpaceId,
        date,
        time,
        bookingId
    };

    // Save booking
    bookings.push(bookingDetails);

    try {
        // Encode booking details as a JSON string in the QR code
        const qrData = JSON.stringify({ bookingId, parkingSpaceId, userId, date, time });
        const qrCode = await QRCode.toDataURL(qrData);
        res.json({ qrCode, bookingId, message: 'Booking successful' });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).send('Failed to generate QR code');
    }
});

// Connect to MQTT broker
const mqttClient = mqtt.connect('mqtt://91.121.93.94'); // Use your MQTT broker IP



const parkingSpaces = {
    'parking/space/001': { status: 'vacant', timerStart: null, fee: 0 },
    'parking/space/002': { status: 'vacant', timerStart: null, fee: 0 }
};

mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe(['parking/space/001', 'parking/space/002']);
});

mqttClient.on('message', (topic, message) => {
    const status = message.toString();
    const space = parkingSpaces[topic];

    console.log(`Received message: ${status} on topic: ${topic}`);
    
    // Check for a status change before updating
    if (status !== space.status) { // Only update if status actually changes
        if (status === 'occupied' && space.status === 'vacant') {
            space.timerStart = Date.now();
            space.status = 'occupied';
            space.fee = 0; // Reset fee on new occupancy
        } else if (status === 'vacant' && space.status === 'occupied') {
            const duration = Date.now() - space.timerStart;
            const hours = duration / (1000 * 10); // 10 seconds as 1 hour
            space.fee = Math.ceil(hours) * 10; // Calculate fee
            space.status = 'vacant';
            space.timerStart = null; // Clear timer start
        }
        // Emit the update only if there was a status change
        io.emit('parking update', { topic, status: space.status, fee: space.fee, timerStart: space.timerStart });
    }
});

io.on('connection', (socket) => {
    console.log('A client connected');
    socket.emit('initial data', parkingSpaces);
    socket.on('disconnect', () => {
        console.log('A client disconnected');
    });
});

app.post('/api/saveLocation', (req, res) => {
    const { lat, lng } = req.body;
    console.log('Received location:', { lat, lng });
    // Perform further processing or store the location data as needed
    res.json({ message: 'Location saved successfully' });
  });

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});