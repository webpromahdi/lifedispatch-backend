import bcrypt from "bcryptjs";
import passport from "passport";
import {
	Strategy as GoogleStrategy,
	type Profile,
	type VerifyCallback,
} from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import { AuthProvider, UserRole } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import config from "./index.js";

passport.use(
	new LocalStrategy(
		{
			usernameField: "email",
			passwordField: "password",
		},
		async (email, password, done) => {
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
		},
	),
);

passport.use(
	new GoogleStrategy(
		{
			clientID: config.GOOGLE_CLIENT_ID,
			clientSecret: config.GOOGLE_CLIENT_SECRET,
			callbackURL: config.GOOGLE_CLIENT_CALLBACK_URL,
		},
		async (
			accessToken: string,
			refreshToken: string,
			profile: Profile,
			done: VerifyCallback,
		) => {
			const email = profile.emails?.[0]?.value;

			if (!email) {
				return done(null, false, {
					message: "No email found from google!",
				});
			}

			let user = await prisma.user.findUnique({
				where: {
					email,
				},
			});

			if (user) {
				if (!user.googleId) {
					user = await prisma.user.update({
						where: { email },
						data: {
							googleId: profile.id,
							authProvider: AuthProvider.GOOGLE,
						},
					});
				}
				return done(null, user);
			}

			user = await prisma.user.create({
				data: {
					name: profile.displayName,
					email: email,
					role: UserRole.PATIENT,
					googleId: profile.id,
					authProvider: AuthProvider.GOOGLE,
				},
			});

			return done(null, user);
		},
	),
);
