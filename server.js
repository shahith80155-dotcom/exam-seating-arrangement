require("dotenv").config()
const express = require("express")
const mysql = require("mysql2")
const cors = require("cors")
const { Resend } = require("resend")
const resend = new Resend(process.env.RESEND_API_KEY)
const multer = require("multer")
const csv = require("csv-parser")
const fs = require("fs")
let otpStore = {}
const upload = multer({ dest: "uploads/" })
const app = express()
app.use(cors())
app.use(express.json())
app.get("/", (req, res) => {
    res.send("API Running ✅")
})
// DB
const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
})
db.connect(err => {
    if(err) throw err
    console.log("MySQL Connected")

    // ✅ CREATE TABLES AUTOMATICALLY

    db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fname VARCHAR(100),
            lname VARCHAR(100),
            email VARCHAR(100),
            dob DATE,
            username VARCHAR(100),
            password VARCHAR(100)
        )
    `)

    db.query(`
        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            regno VARCHAR(50),
            subject VARCHAR(50),
            dept VARCHAR(50),
            type VARCHAR(20)
        )
    `)

    db.query(`
    CREATE TABLE IF NOT EXISTS classrooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_name VARCHAR(50),
        row_count INT,
        col_count INT,
        bench INT,
        allowed_depts TEXT   -- 👈 ADD THIS
    )
`)

    db.query(`
        CREATE TABLE IF NOT EXISTS seating_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            data JSON
        )
    `)

    console.log("Tables ready ✅")
})
// MAIL

/* ================= OTP SEND ================= */
app.post("/send-otp", async (req, res) => {

    let { email } = req.body
    let otp = Math.floor(100000 + Math.random()*900000)

    // ✅ STORE OTP HERE
    otpStore[email] = {
        otp,
        time: Date.now()
    }

    try {
        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: email,
            subject: "OTP Verification",
            text: `Your OTP is: ${otp}`
        })

        res.send("OTP sent ✅")

    } catch (err) {
        console.log("MAIL ERROR:", err)
        res.send("Error sending OTP ")
    }
})

/* ================= REGISTER ================= */
app.post("/register", (req, res) => {

    let { fname, lname, email, dob, username, password, otp } = req.body

    // ✅ Check OTP exists
    if (!otpStore[email]) {
        return res.send("OTP not found ")
    }

    // ✅ Check expiry (1 min)
    if (Date.now() - otpStore[email].time > 60000) {
        delete otpStore[email]
        return res.send("OTP expired ⏱️")
    }

    // ✅ Check OTP match
    if (otpStore[email].otp != otp) {
        return res.send("Invalid OTP ")
    }

    // ✅ Check user exists
    let check = "SELECT * FROM users WHERE username=?"

    db.query(check, [username], (err, result) => {

        if (err) {
            return res.send("Server error ")
        }

        if (result.length > 0) {
            return res.send("User exists ")
        }

        // ✅ Insert user
        let sql = `INSERT INTO users (fname,lname,email,dob,username,password)
                   VALUES (?,?,?,?,?,?)`

        db.query(sql, [fname, lname, email, dob, username, password], (err) => {

            if (err) {
                return res.send("Error saving user ")
            }

            // ✅ Clear OTP after success
            delete otpStore[email]

            res.send("Registered successfully ✅")
        })
    })
})
/* ================= LOGIN ================= */
app.post("/login", (req, res) => {

    let { username, password } = req.body

    let sql = "SELECT * FROM users WHERE (username=? OR email=?) AND password=?"

db.query(sql, [username, username, password], (err, result) => {

        if(err){
            return res.json({success:false, msg:"Server error "})
        }

        if(result.length > 0){
            res.json({success:true, msg:"Login success ✅"})
        }else{
            res.json({success:false, msg:"Invalid user or password "})
        }
    })
})

/* ================= FORGOT OTP ================= */
app.post("/forgot-otp", async (req, res) => {

    let { email } = req.body

    let check = "SELECT * FROM users WHERE email=?"

    db.query(check, [email], async (err, result) => {

        if(err) return res.send("Server error ")

        if(result.length === 0){
            return res.send("Email not found ")
        }

        let otp = Math.floor(100000 + Math.random()*900000)

        otpStore[email] = {
            otp,
            time: Date.now()
        }

        try {
            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: email,
                subject: "Reset OTP",
                text: `Your OTP is: ${otp}`
            })

            res.send("OTP sent ✅")

        } catch (err) {
            console.log("MAIL ERROR:", err)
            res.send("Error sending OTP ")
        }

    })
})

/* ================= RESET PASSWORD ================= */
app.post("/reset-password", (req,res)=>{

    let { email, otp, newPassword } = req.body

    if(!otpStore[email]){
        return res.send("OTP not found ")
    }

    if(Date.now() - otpStore[email].time > 60000){
        delete otpStore[email]
        return res.send("OTP expired ")
    }

    if(otpStore[email].otp != otp){
        return res.send("Invalid OTP ")
    }

    let sql = "UPDATE users SET password=? WHERE email=?"

    db.query(sql, [newPassword,email], err=>{
        if(err) throw err

        delete otpStore[email]

        res.send("Password updated ")
    })
})

app.post("/save-classrooms", (req, res) => {

    let { bench, rooms } = req.body

    db.query("DELETE FROM classrooms")

    rooms.forEach(room => {

        let sql = `
        INSERT INTO classrooms 
        (room_name, row_count, col_count, bench, allowed_depts)
        VALUES (?,?,?,?,?)`

        db.query(sql, [
            room.room_name,
            room.row_count,
            room.col_count,
            bench,
            JSON.stringify(room.allowed_depts) // ✅ IMPORTANT
        ])
    })

    res.send("Classroom details saved ✅")
})

app.post("/upload-students", upload.fields([
    { name: "regularFile" },
    { name: "arrearFile" }
]), (req, res) => {

    let dept = req.body.dept

    let insertStudent = (filePath, type) => {
        return new Promise((resolve) => {

            let data = []

            fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row) => {
                data.push([
                    row.name,
                    row.regno,
                    row.subject || row.subcode || "NA",
                    dept,
                    type
                ])
            })
            .on("end", () => {

                data.forEach(s => {
                    db.query(
                        "INSERT INTO students (name, regno, subject, dept, type) VALUES (?,?,?,?,?)",
                        s
                    )
                })

                resolve()
            })
        })
    }

    let tasks = []

    if(req.files["regularFile"]){
        tasks.push(insertStudent(req.files["regularFile"][0].path, "regular"))
    }

    if(req.files["arrearFile"]){
        tasks.push(insertStudent(req.files["arrearFile"][0].path, "arrear"))
    }

    Promise.all(tasks).then(()=>{
        res.send("Students uploaded successfully ✅")
    })

})

/* =========================
   GENERATE SEATING API
========================= */
app.get("/generate-seating", (req, res) => {

    let strictMode = req.query.strict === "true"

    db.query("SELECT * FROM students", (err, studentsData) => {
        if(err) return res.send("Student fetch error ❌")

        db.query("SELECT * FROM classrooms", (err, rooms) => {
            if(err) return res.send("Room fetch error ❌")

            // ================= REMOVE DUPLICATES =================
            let seen = new Set()
            let students = studentsData.filter(s => {
                let reg = s.regno.trim()
                if(seen.has(reg)) return false
                seen.add(reg)
                return true
            })

            // SORT
            students.sort((a,b)=> a.subject.localeCompare(b.subject))

            let allRooms = []

            // ================= MAIN ROOMS =================
            rooms.forEach(room => {

                let grid = Array.from({ length: room.row_count }, () =>
                    Array.from({ length: room.col_count }, () =>
                        Array(room.bench || 1).fill(null)
                    )
                )

                let tempStudents = [...students]

                solveSeating(grid, tempStudents, 0, {count:0}, strictMode)

                // 🔥 FINAL FILL
                fillRemaining(grid, tempStudents, strictMode)

                students = tempStudents

                allRooms.push({
                    room: room.room_name,
                    layout: grid
                })
            })

            // ================= EXTRA ROOMS =================
            if(req.query.extra === "true" && students.length > 0){

                let extraCount = parseInt(req.query.extraCount) || 1
                let extraNames = (req.query.extraNames || "").split(",")

                let extraRows = parseInt(req.query.rows) || 5
                let extraCols = parseInt(req.query.cols) || 5
                let extraBench = parseInt(req.query.bench) || 1

                for(let x = 0; x < extraCount; x++){

                    if(students.length === 0) break

                    let extraGrid = Array.from({ length: extraRows }, () =>
                        Array.from({ length: extraCols }, () =>
                            Array(extraBench).fill(null)
                        )
                    )

                    let tempStudents = [...students]

                    solveSeating(extraGrid, tempStudents, 0, {count:0}, strictMode)

                    fillRemaining(extraGrid, tempStudents, strictMode)

                    students = tempStudents

                    allRooms.push({
                        room: extraNames[x] || `Extra Room ${x+1}`,
                        layout: extraGrid
                    })
                }
            }

            // ================= FORMAT + SUBJECT MAP =================
            let clean = allRooms.map(room => {

                let subjectMap = {}

                room.layout.forEach(row => {
                    row.forEach(col => {
                        col.forEach(s => {
                            if(!s) return

                            if(!subjectMap[s.subject]){
                                subjectMap[s.subject] = {
                                    count: 0,
                                    students: []
                                }
                            }

                            subjectMap[s.subject].count++
                            subjectMap[s.subject].students.push(s.regno)
                        })
                    })
                })

                return {
                    room: room.room,
                    subjectMap,
                    layout: room.layout.map(row =>
                        row.map(col =>
                            col.map(s =>
                                s
                                ? `${s.name}\nReg: ${s.regno}\nDept: ${s.dept}\nSub: ${s.subject}`
                                : "Empty"
                            )
                        )
                    )
                }
            })

            // ================= FINAL RESULT =================
            let result = {
                mode: strictMode ? "STRICT" : "NORMAL",
                seating: clean,
                unseated: students.map(s =>
                    `${s.name} (${s.regno} - ${s.subject})`
                ),
                created_at: new Date()
            }

            db.query(
                "INSERT INTO seating_history (data) VALUES (?)",
                [JSON.stringify(result)]
            )

            res.json(result)
        })
    })
})
// ================= SOLVER =================
function solveSeating(grid, students, index = 0, attempts = {count:0}, strictMode){

    if(attempts.count++ > 50000) return false

    let rows = grid.length
    let cols = grid[0].length
    let bench = grid[0][0].length

    if(index === rows * cols * bench){
        return true
    }

    let r = Math.floor(index / (cols * bench))
    let c = Math.floor((index % (cols * bench)) / bench)
    let b = index % bench

    if(grid[r][c][b] !== null){
        return solveSeating(grid, students, index + 1, attempts, strictMode)
    }

    for(let i = 0; i < students.length; i++){

        let s = students[i]

        if(
            isDeptSafe(s, r, c, grid, strictMode) &&
            isSubjectSafe(s, r, c, grid, strictMode)
        ){
            grid[r][c][b] = s
            students.splice(i, 1)

            if(solveSeating(grid, students, index + 1, attempts, strictMode)){
                return true
            }

            grid[r][c][b] = null
            students.splice(i, 0, s)
        }
    }

    return false
}
function isSubjectSafe(seat, r, c, grid, strictMode){

    if(!strictMode) return true  // NORMAL MODE → allow same subject

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.subject === seat.subject) return false
            }
        }
    }

    return true
}

function isDeptSafe(seat, r, c, grid, strictMode){

    if(!strictMode) return true  // NORMAL MODE → allow same dept

    let dirs = [[0,-1],[0,1],[-1,0],[1,0]]

    for(let d of dirs){
        let nr = r + d[0]
        let nc = c + d[1]

        if(grid[nr] && grid[nr][nc]){
            for(let n of grid[nr][nc]){
                if(n && n.dept === seat.dept) return false
            }
        }
    }

    return true
}
function fillRemaining(grid, students, strictMode){

    let rows = grid.length
    let cols = grid[0].length
    let bench = grid[0][0].length

    for(let r=0; r<rows; r++){
        for(let c=0; c<cols; c++){
            for(let b=0; b<bench; b++){

                if(students.length === 0) return

                if(grid[r][c][b] === null){

                    let placed = false

                    // STRICT TRY
                    for(let i=0; i<students.length; i++){
                        let s = students[i]

                        if(
                            isDeptSafe(s,r,c,grid,strictMode) &&
                            isSubjectSafe(s,r,c,grid,strictMode)
                        ){
                            grid[r][c][b] = s
                            students.splice(i,1)
                            placed = true
                            break
                        }
                    }

                    // RELAX SUBJECT ONLY
                    if(!placed){
                        for(let i=0; i<students.length; i++){
                            let s = students[i]

                            if(isSubjectSafe(s,r,c,grid,false)){
                                grid[r][c][b] = s
                                students.splice(i,1)
                                placed = true
                                break
                            }
                        }
                    }

                    // FORCE FILL (NO EMPTY SEATS)
                    if(!placed){
                        grid[r][c][b] = students.shift()
                    }
                }
            }
        }
    }
}
function placeStudent(grid, r, c, b, s){
    grid[r][c][b] = {
        name: s.name,
        regno: s.regno,
        dept: s.dept,
        subject: s.subject
    }
}

app.delete("/delete-history/:id", (req, res) => {

    let id = req.params.id

    db.query("DELETE FROM seating_history WHERE id = ?", [id], (err) => {
        if(err) return res.send("Error deleting ❌")

        res.send("History deleted ✅")
    })
})
app.delete("/delete-all-students", (req, res) => {

    db.query("DELETE FROM students", (err) => {
        if(err) return res.send("Error deleting students ❌")

        res.send("All students deleted ✅")
    })
})
app.delete("/delete-all-classrooms", (req, res) => {

    db.query("DELETE FROM classrooms", (err) => {
        if(err) return res.send("Error deleting classrooms ❌")

        res.send("All classrooms deleted ✅")
    })
})
app.delete("/reset-all", (req, res) => {

    db.query("DELETE FROM students", (err) => {
        if(err) return res.send("Error clearing students ❌")

        db.query("DELETE FROM classrooms", (err) => {
            if(err) return res.send("Error clearing classrooms ❌")

            db.query("DELETE FROM seating_history", (err) => {
                if(err) return res.send("Error clearing history ❌")

                res.send("System fully reset ✅")
            })
        })
    })
})
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log("Server running on port " + PORT)
})