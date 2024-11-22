import express from 'express';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import path from "path";
import { fileURLToPath } from 'url';
import { timeout } from 'puppeteer';
import jsdom from 'jsdom';

const { JSDOM } = jsdom;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECRET_KEY = 'aqeel';

const app = express();

app.use(bodyParser.json());
app.use(cookieParser());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '.')));
// console.log(path.join(__dirname, 'login.html'));

// Function to scrape attendance using Puppeteer
const scrapeAttendance = async (username, password) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu',]
  });
  const page = await browser.newPage();

  const loginUrl = 'https://automation.vnrvjiet.ac.in/eduprime3';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });



  const usernameSelector = 'input[name="username"]';
  const passwordSelector = 'input[name="xpassword"]';
  const loginButtonSelector = 'input[type="submit"]';

  await page.waitForSelector(usernameSelector);
  await page.type(usernameSelector, username); 
  await page.waitForSelector(passwordSelector); 
  await page.type(passwordSelector, password); 
  await page.waitForSelector(loginButtonSelector); 
  await page.click(loginButtonSelector);
  // console.log("logging in");
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // console.log("login navigation done");

  let studentId = null;

  const scriptTags = await page.$$eval('script', scripts => scripts.map(script => script.innerHTML));
  scriptTags.forEach(scriptContent => {
    const match = scriptContent.match(/studentId\s*=\s*(\d+)/);
    if (match) {
      studentId = match[1];
    }    
  });
  
  if (studentId) {
    console.log("Extracted student ID:", studentId);
    const mainUrl = `https://automation.vnrvjiet.ac.in/EduPrime3/Academic/Helper/GetStdAttPer?studentId=${studentId}&semId=undefined&_=1731680622299`;
    
    const jsonData = await page.evaluate(async (url) => 
      { 
        const response = await fetch(url); 
        return await response.json(); 
      }, mainUrl);

    // console.log('Extracted JSON Data:', jsonData); 
    
    const data = jsonData.Data;
    // console.log(data);

    const dom = new JSDOM(data);


    // Extract the table
    const table = dom.window.document.querySelector('.table-responsive table');
    const tableHtml = table ? table.outerHTML : '';

    // Output the extracted table HTML
    // console.log('Extracted Table HTML:', tableHtml);


    await browser.close(); 
    return { studentId, tableHtml }; 
    } else { 
      console.log("Student ID not found."); 
      await browser.close(); 
      return { studentId: null, tableHtml: '' }; 
    }
};

const isAuthenticated = (req,res,next) =>{
  const token = req.cookies.token;
  if(token){
    next();
  }
  else{
    res.redirect('/');
  }
};

app.get('/', (req, res) => {
  // Serve login.html instead of index.html
  const token = req.cookies.token;
  if(token){
    res.sendFile(path.join(__dirname, 'home.html'));
  }
  else{
    // res.redirect('/');
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

app.post('/submit', async (req, res) => {
  const username = req.body.username;
  // console.log(username);
  const password = req.body.password;
  // console.log(password);

  try {
    const attendanceData = await scrapeAttendance(username, password);
    
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '30d' });

    res.cookie('username', username, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
    // res.cookie('client_username', username, { maxAge: 30 * 24 * 60 * 60 * 1000});
    res.cookie('password', password, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
    // res.cookie('client_password', password, { maxAge: 30 * 24 * 60 * 60 * 1000});
    res.cookie('token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });

    res.json({ success: true, attendanceData });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/attendance',isAuthenticated,(req,res) => {
  // console.log("inside the attendance route");
  res.sendFile(path.join(__dirname,'home.html'));
});

app.post('/logout',(req,res)=>{
  const username = 'username';
  const password = 'password';
  const token = 'token';
  res.clearCookie(username);
  res.clearCookie(password);
  res.clearCookie(token);
  res.redirect('/');
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});