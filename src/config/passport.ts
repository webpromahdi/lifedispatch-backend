import passport from "passport";
import {Strategy as LocalStrategy} from "passport-local";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
passport.use(new LocalStrategy({
    usernameField: "email",
    passwordField: "password",
},
async(email, password, done) =>{
          try {
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return done(null, false, {
            message: "User does not exists!",
          });
        }

        if (!user.password) {
          return done(null, false, {
            message:
              "This account does not have password, Please login with google",
          });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
          return done(null, false, {
            message: "Password does not matched",
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
}
));