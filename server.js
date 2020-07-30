// GET ENVIRONMENT VARIABLES when in development
if (process.env.NODE_ENV !== 'production') {
  require ('dotenv').config()
}

//  LAUNCH SERVER AND ALL PACKAGES
const express = require ('express')
const app = express()
// use the environment port (for heroku deployment) or 3000 if used locally
const PORT = process.env.PORT || 3000
//for encrypting the password
const bcrypt = require ('bcrypt')
// handle authentication   
const passport = require ('passport') 
const flash = require ('express-flash')
const session = require ('express-session')
//allows us to use methods other than POST and GET in forms
const methodOverride = require ('method-override')
//use to generate random uuid for room ids
const {v4: uuidV4} = require ('uuid')

//NOT IDEAL - need to connect to database
const users = []

const initializePassport = require ('./passport_config.js')
initializePassport(
  passport, 
  username => users.find(user => user.username === username), 
  id => users.find(user => user.id === id)
)

//set up how we will access our views - using ejs which we installed
app.set('view engine', 'ejs')

//middlewares
app.use(express.static('public')) // all our js and css will be inside 'public' folder
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session ({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized : false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

//Handle Routes
app.get('/', (req, res) => {
    res.render('index.ejs')
})
app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs')
})
app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs')
})
// dynamically assign the roomid to the uuid that's generated
app.get('/:room', (req, res) => {
  res.render('room.ejs', {roomId: req.params.room})
})

app.post ('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect : `/${uuidV4()}`,
  failureRedirect: '/login', 
  failureFlash: true
}))

app.post('/register', checkNotAuthenticated, async (req, res) => {
    try {
        //10 is the cost factor ie 2 to the power 10 expansion rounds
        const hashedPassword = await bcrypt.hash (req.body.password, 10) 
        users.push({
          id: Date.now().toString(),
          username: req.body.username, 
          password: hashedPassword
        })
        res.redirect('/login')
    }
    catch {
        res.redirect('/register')
    }
})

app.delete('/logout', (req, res)=> {
  req.logOut()
  res.redirect('/login')
})

// if the user is not authenticated, take them to the login page
function checkAuthenticated (req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.redirect('/login')
}

// if user already authenticated don't take them to the register or login pages
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/')
  }
  next()
}

//------------ CONFIGURING SOCKET.IO ----------------

var http = require('http').createServer(app)
// Listen on whatever the defined port is (not only 3000)
http.listen(PORT, () => {
    console.log(`listening on ${PORT}`)
})

//socket.io instantiation
const io = require("socket.io")(http)

//listen on every connection 
io.on('connection', socket => {
    let activeSockets = []

    //default username
    socket.username = "Anonymous"

    socket.on('join_room', (roomId, userId) => {
      socket.join(roomId)
      socket.to(roomId).broadcast.emit('user_connected', userId)

      socket.on('disconnect', () => {
        socket.to(roomId).broadcast.emit('user_disconnected', userId)
      })
    })    

    //listen on new_chat_message
    socket.on('new_chat_message', (data) => {
        //emit the new message
        io.sockets.emit('new_chat_message', {message:data.message, username: socket.username})
    })  
})