const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
//const socket = require('socket.io');
//const io = socket(server);
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('redis');
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { execFile } = require('child_process');

server.listen(3993, () => console.log("sneakpeek started at 3993"));

const redis = createClient();
redis.connect();


app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

const client = new MongoClient(`mongodb+srv://tint:${process.env.DB_PWD}@cluster0.upxu80i.mongodb.net/admin?authSource=admin&replicaSet=atlas-1228dx-shard-0&w=majority&readPreference=primary&appname=MongoDB%20Compass&retryWrites=true&ssl=true`);
let DB;

(async function () {
    try {
        await client.connect();
        DB = client.db("sneakpeek");
        console.log("Connected to DB too...");
    } catch (e) {
        console.log("DB Connection failed", e);
    }
})();


app.put('/api/me/:me', function (req, res) {
    redis.set(req.params.me, JSON.stringify(req.body)).then(() => redis.expire(req.params.me, 3)).catch(e => console.log(e));
    redis.set(req.body.id, req.params.me).then(() => redis.expire(req.body.id, 3)).catch(e => console.log(e));
    res.json(req.body);
});

app.get('/api/you/:you', function (req, res) {
    redis.get(req.params.you).then(d => res.json(JSON.parse(d))).catch(e => console.log(e));
});

app.get('/api/id/:id', function (req, res) {
    redis.get(req.params.id).then(you => res.json({ you })).catch(e => console.log(e));
});


const COLLECTIONS = {
    ROOMS: 'room',
    MESSAGES: 'message',
    USERS: 'user',
    SHELL: 'shell'
};

app.get('/api/shell/auth/:phrase', function (req, res) {
    DB.collection(COLLECTIONS.SHELL).findOne({ type: 'phrase' }).then((shell) => {
        const { phrase } = req.params;
        const auth = atob(phrase) === shell.phrase;
        let token = undefined;
        if (auth) {
            token = btoa(uuidv4());
            redis.set(token, token).then(() => redis.expire(token, 10)).catch(e => console.log(e));
        }
        res.json({
            auth,
            token
        });
    });
});

app.get('/api/shell/auth/validate/:token', function (req, res) {
    redis.get(req.params.token).then(v => res.json({ v })).catch(e => res.json({ e: 'e' }));
});


app.post('/api/chat/room', function (req, res) {
    const { p1, p2 } = req.body;
    DB.collection(COLLECTIONS.ROOMS).updateOne(getRoomQuery(p1, p2),
        {
            $set: { p1, p2 }
        }, {
        upsert: true
    }).then(r => {
        const { upsertedId } = r;
        if (upsertedId) {
            res.json({
                p1, p2, _id: upsertedId
            });
        } else {
            DB.collection(COLLECTIONS.ROOMS).findOne(getRoomQuery(p1, p2)).then(r => {
                res.json(r);
            });
        }
    });
});


app.get('/api/chat/room/:me', function (req, res) {
    const { me } = req.params;
    DB.collection(COLLECTIONS.ROOMS).find({
        $or: [
            { p1: me },
            { p2: me }
        ]
    }).toArray().then(rooms => {
        if (rooms.length === 0) {
            res.json(rooms);
        } else {
            const lastMessages = rooms.map(room => {
                return DB.collection(COLLECTIONS.MESSAGES).find({ roomId: '' + room._id }).limit(1).sort({ $natural: -1 }).toArray()
            });
            Promise.all(lastMessages).then(responses => {
                for (let i = 0; i < rooms.length; i++) {
                    rooms[i].lastMsg = responses[i][0];
                }
                res.json(rooms);
            })
        }
    });
});


app.post('/api/chat/message', function (req, res) {
    DB.collection(COLLECTIONS.MESSAGES).insertOne(req.body).then(r => res.json(r));
});

app.get('/api/chat/message/:roomId', function (req, res) {
    DB.collection(COLLECTIONS.MESSAGES).find({ roomId: req.params.roomId }).limit(20).sort({ $natural: -1 }).toArray().then(r => {
        r.reverse();
        res.json(r);
    });
});

app.get('/api/user/:me', function (req, res) {
    DB.collection(COLLECTIONS.USERS).findOne({ username: req.params.me }).then(r => res.json({ valid: r !== null }));
});

function getRoomQuery(p1, p2) {
    return {
        $or: [
            {
                $and: [{ p1: p1 },
                { p2: p2 }]
            },
            {
                $and: [{ p1: p2 },
                { p2: p1 }]
            }
        ]
    };
}






/**
 * Two ways 
 * 
 * 1. Query Param
 * 2. Path Param
 */





app.get('/api/weather', function (req, res) {
    const { state, city } = req.query;
    const content = fs.readFileSync(`${state}/${city}`).toString();
    //select temp from weather where state=state and city=city;
    res.json({
        "state": state,
        "city": city,
        "content": content
    });
});




app.get('/api/weather/create', function (req, res) {
    const { state, city, temp } = req.query;
    //const content = fs.readFileSync(`${state}/${city}`).toString();
    //select temp from weather where state=state and city=city;
    fs.writeFileSync(`${state}/${city}`, temp,)
    res.json({
        "state": state,
        "city": city,
        "content": content
    });
});



app.get('/api/deploy/ss/:branch', function (req, res) {
    const { branch } = req.params;
    execFile('/root/eureka/projects/deploy-ss.sh', [branch], (err, stdo, ste) => {
        if (err) {
            res.send(err);
        } else if (ste) {
            res.send(ste);
        } else {
            res.send(stdo);
        }
    })
});
