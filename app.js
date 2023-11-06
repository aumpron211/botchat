const fs = require("fs");
const login = require("facebook-chat-api");
const hbs = require('hbs');
const express = require('express')
const app = express()
const port = process.env.APP_PORT || 9090
const bodyParser = require('body-parser')
const setUp = require('./setUp.json')
const flash = require('express-flash-message')
const moment = require('moment-timezone');
const db = require('./config');
// const session = require('express-session');
const jwt = require('jsonwebtoken');
const checkToken = require('./jwt/checkToken');
const secretKey = 'jhkg12h3gjh123jhg23i12u3y98yaisudya7s6dyiaushd';
// const MemoryStore = require('memorystore');
const cookieParser = require('cookie-parser');

app.set('view engine', 'hbs');
app.engine('hbs', require('hbs').__express);
hbs.registerPartials(__dirname + '/views/partials', function (err) { });
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(cookieParser());


app.use((err, req, res, next) => {
    // Handle and respond to errors
    res.status(500).send('An error occurred');
});


const convertTime = (time, seconds) => {
    const hours = parseInt(time.split(':')[0].padStart(2, '0'));
    const hour = hours < 10 ? '0' + hours : hours;
    const minutes = parseInt(time.split(':')[1].padStart(2, '0'));

    const totalSeconds = (hour * 60 + minutes) * 60 + seconds;
    const downSeconds = totalSeconds - 0.2;
    const downMinutes = minutes - 1;
    const downMinute = parseInt(downMinutes) < 10 ? '0' + downMinutes : downMinutes;

    const totalDateInput = `${hour}:${downMinute}:59`;

    return totalDateInput;
};


function fetchUserIdByUsername(username, callback) {
    const query = 'SELECT User_id FROM User WHERE Username = ?';

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('Error querying the database: ' + err);
            callback(err, null);
        } else {
            if (results.length > 0) {
                callback(null, results[0].User_id); // Return the user's ID
            } else {
                callback(null, null); // User not found
            }
        }
    });
}

function fetchUserIdById(userId, callback) {
    const query = 'SELECT * FROM User WHERE User_id = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error querying the database: ' + err);
            callback(err, null);
        } else {
            if (results.length > 0) {
                callback(null, results[0]); // Return the user's ID
            } else {
                callback(null, null); // User not found
            }
        }
    });
}


function decodeToken(token, secretKey) {
    try {
        const decoded = jwt.verify(token, secretKey);
        return decoded;
    } catch (err) {
        // Token is invalid or has expired
        return null;
    }
}




app.get('/', checkToken, (req, res) => {
    const token = req.cookies['token'];

    const decodedPayload = decodeToken(token, secretKey);

    const userData = {
        userId: decodedPayload.userId,
        username: decodedPayload.username,
    };


    fetchUserIdById(decodedPayload.userId, (err, data) => {
        if (err) {
            console.error('Error fetching user:', err);
            res.redirect('/');
        } else {
            data['token'] = token;
            res.render('home', { data })
        }
    });
})

app.get('/login', (req, res) => {
    res.render('login')
})

app.post('/login', (req, res) => {
    fetchUserIdByUsername(req.body.username, (err, userId) => {
        if (err) {
            console.error('Error fetching user:', err);
            res.redirect('/');
        } else {
            if (userId) {
                const userData = {
                    userId: userId,
                    username: req.body.username,
                };

                const token = jwt.sign(userData, secretKey, { expiresIn: '4h' });
                if (token) {
                    res.cookie('token', token, {
                        expires: new Date(Date.now() + 60 * 60 * 1000), // Expires in 1 hour
                        secure: true, // Only send over HTTPS
                        httpOnly: true, // Cannot be accessed by JavaScript
                    });

                    const query = `UPDATE User SET Token = ? WHERE Username = ?`;
                    db.query(query, [token, req.body.username], (err, result) => {
                        if (err) {
                            console.error('Error inserting token: ' + err.message);
                            return res.status(500).json({ message: 'Error inserting token' });
                        }
                        return res.redirect('/');
                    });

                } else {
                    res.redirect('/login');
                }
            } else {
                res.redirect('/login');
            }
        }
    });
});


app.get('/loading', (req, res) => {
    res.render('loading')
})
app.post('/saveToken', (req, res) => {
    let data = req.body;
    const token = req.cookies['token'];

    const decodedPayload = decodeToken(token, secretKey);
    const query = 'UPDATE User SET Token = ?, Cookie = ?, Chat = ? WHERE User_id = ?';

    db.query(query, [data.Token, data.Cookie, data.Chat, decodedPayload.userId], (err, result) => {
        if (err) {
            console.error('Error inserting token: ' + err.message);
            return res.status(500).json({ message: 'Error inserting token' });
        }


        // Redirect once after the query is complete
        return res.redirect('/');
    });
});

// const credential = { appState: JSON.parse(fs.readFileSync('appState.json', 'utf-8')) }

// console.log(credential)

app.post('/send', async (req, res, next) => {
    const data_input = req.body;
    let credential = '';
    const token = req.cookies['token'];

    try {
        if (!data_input) {
            return res.redirect('/')
        }
        const decodedPayload = decodeToken(token, secretKey);
        fetchUserIdById(decodedPayload.userId, async (err, data) => {
            if (err) {
                console.error('Error fetching user:', err);
                res.redirect('/');
            } else {
                if (data) {
                    credential = { appState: eval(`${data.Cookie}`) }
                    login(credential, async (err, api) => {
                        if (err) return console.error(err);
                        const re = /\s(AM|PM)$/;
                        const start_keyword = parseInt(data_input.keyword.split('-')[0]);
                        const end_keyword = parseInt(data_input.keyword.split('-')[1]);
                        const loop = parseInt(data_input.loop);

                        const currentDateTime = new Date();
                        const currentSeconds = currentDateTime.getSeconds();
                        const startDateInput = convertTime(data_input.time, currentSeconds);


                        while (startDateInput != moment.tz('Asia/Bangkok').format('HH:mm:ss')) {
                            console.log(startDateInput)
                            console.log(moment.tz('Asia/Bangkok').format('HH:mm:ss'))
                            await new Promise((resolve) => setTimeout(resolve, 1200));
                            if (startDateInput == moment.tz('Asia/Bangkok').format('HH:mm:ss')) {
                                break;
                            }
                        }

                        for (let index = 0; index < loop; index++) {
                            for (let i = start_keyword; i < end_keyword + 1; i++) {
                                api.sendMessage(`${i}`, `${data.Chat}`)
                            }
                        }
                        console.log('Successfully sent message')
                        return res.redirect('/');
                    });
                } else {
                    console.log(1)
                    return res.redirect('/')
                }
            }
        });


    } catch (error) {
        console.log(2)

        console.log(error)
        next(error);
        return res.redirect('/')
    }
})

const server = app.listen(port, () => {
    const port = server.address().port;
  console.log(`Express is working on port ${port}`);
})
