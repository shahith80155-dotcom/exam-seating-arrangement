<script>

let countdown

// EMAIL VALIDATION
function validateEmail(){
    let email = emailInput.value

    if(!email.includes("@") || !email.includes(".")){
        emailErr.innerText = "Invalid email"
        otpBtn.style.display = "none"
    } else {
        emailErr.innerText = ""
        otpBtn.style.display = "inline-block"
    }
}

// PASSWORD VALIDATION
function validatePassword(){
    let pass = newpass.value
    let passRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{6,}$/

    if(!passRegex.test(pass)){
        passErr.innerText = "Min 6 chars, 1 Capital, 1 Number, 1 Symbol"
    } else {
        passErr.innerText = ""
    }
}

// TIMER
function startTimer(){
    let timeLeft = 60

    timer.innerText = "OTP expires in 60s"
    resendBtn.disabled = true
    resetBtn.disabled = false

    clearInterval(countdown)

    countdown = setInterval(()=>{
        timeLeft--
        timer.innerText = "OTP expires in " + timeLeft + "s"

        if(timeLeft <= 0){
            clearInterval(countdown)
            timer.innerText = "OTP expired ❌"
            resendBtn.disabled = false
            resetBtn.disabled = true
        }
    },1000)
}

// SEND OTP
function sendOTP(){

let email = emailInput.value

msg.innerText = "Sending OTP..."
msg.style.color = "black"

fetch("https://exam-seating-arrangement-k7ln.onrender.com/forgot-otp",{
method:"POST",
headers:{"Content-Type":"application/json"},
body: JSON.stringify({email})
})
.then(res=>res.text())
.then(response=>{

    msg.innerText = response

    if(response.includes("OTP")){
        msg.style.color = "green"
        otpSection.style.display="block"
        startTimer()
    } else {
        msg.style.color = "red"
    }

})
}

// RESEND OTP
function resendOTP(){
    sendOTP()
}

// RESET PASSWORD
function resetPassword(){

let data = {
email: emailInput.value,
otp: otp.value,
newPassword: newpass.value
}

// basic check
if(data.otp.trim() === ""){
    msg.innerText = "Enter OTP ❌"
    msg.style.color = "red"
    return
}

msg.innerText = "Updating password..."
msg.style.color = "black"

fetch("https://exam-seating-arrangement-k7ln.onrender.com/reset-password",{
method:"POST",
headers:{"Content-Type":"application/json"},
body: JSON.stringify(data)
})
.then(res=>res.text())
.then(response=>{
    msg.innerText = response

    if(response.includes("success")){
        msg.style.color = "green"
    } else {
        msg.style.color = "red"
    }
})

}

// INPUT REFERENCES
const emailInput = document.getElementById("email")
const otpBtn = document.getElementById("otpBtn")
const otpSection = document.getElementById("otpSection")
const resendBtn = document.getElementById("resendBtn")
const resetBtn = document.getElementById("resetBtn")
const timer = document.getElementById("timer")
const msg = document.getElementById("msg")
const emailErr = document.getElementById("emailErr")
const newpass = document.getElementById("newpass")
const passErr = document.getElementById("passErr")

</script>