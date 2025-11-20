import { promisify } from 'util';
import { Injectable, Optional } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-oauth2';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { VerifyCallback } from 'passport-oauth2';
import type { FactoryProvider } from '@nestjs/common/interfaces/modules/provider.interface';
import type { NcRequest } from '~/interface/config';
import Noco from '~/Noco';
import { UsersService } from '~/services/users/users.service';
import { BaseUser, User } from '~/models';
import { sanitiseUserObj } from '~/utils';

@Injectable()
export class OIDCStrategy extends PassportStrategy(Strategy, 'oidc') {
  constructor(
    @Optional() clientConfig: StrategyOptions,
    private usersService: UsersService,
  ) {
    super(clientConfig);
  }

  userProfile(
    accessToken: string,
    done: (err?: Error | null, profile?: any) => void,
  ): void {
    this._oauth2.get(
      process.env.NC_OIDC_USERINFO_URL ?? '',
      accessToken,
      (err, body) => {
        if (err) {
          console.error('Failed to fetch user profile', err);
          return done(
            new Error(`Failed to fetch user profile: ${err.statusCode}`),
          );
        }

        try {
          const json = JSON.parse(body.toString());
          done(null, json);
        } catch (e) {
          console.error('Failed to parse user profile', e);
          done(e);
        }
      },
    );
  }

  async validate(
    req: NcRequest,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    // mostly copied from older code
    const email = profile.email;
    try {
      const user = await User.getByEmail(email);
      if (user) {
        // if base id defined extract base level roles
        if (req.ncBaseId) {
          BaseUser.get(req.context, req.ncBaseId, user.id)
            .then(async (baseUser) => {
              user.roles = baseUser?.roles || user.roles;
              // + (user.roles ? `,${user.roles}` : '');

              done(null, sanitiseUserObj(user));
            })
            .catch((e) => done(e));
        } else {
          return done(null, sanitiseUserObj(user));
        }
        // if user not found create new user if allowed
        // or return error
      } else {
        const salt = await promisify(bcrypt.genSalt)(10);
        const user = await this.usersService.registerNewUserIfAllowed({
          email_verification_token: null,
          email: profile.email,
          password: '',
          salt,
          req,
        } as any);
        return done(null, sanitiseUserObj(user));
      }
    } catch (err) {
      console.error('Failed to validate user', err);
      return done(err);
    }
  }

  authorizationParams(options: any) {
    const params = super.authorizationParams(options) as Record<string, any>;

    if (options.state) {
      params.state = options.state;
    }

    return params;
  }

  async authenticate(req: Request, options?: any): Promise<void> {
    try {
      return super.authenticate(req, {
        ...options,
        clientID: process.env.NC_OIDC_CLIENT_ID ?? '',
        clientSecret: process.env.NC_OIDC_CLIENT_SECRET ?? '',
        callbackURL: req.ncSiteUrl + Noco.getConfig().dashboardPath,
        passReqToCallback: true,
        scope: ['openid', 'profile', 'email'],
        state: 'oidc',
      });
    } catch (e) {
      console.error('Failed to authenticate', e);
      throw e;
    }
  }
}

export const OIDCStrategyProvider: FactoryProvider = {
  provide: OIDCStrategy,
  inject: [UsersService],
  useFactory: async (usersService: UsersService) => {
    // read client id and secret from env variables
    // if not found provide dummy values to avoid error
    // it will be handled in authenticate method ( reading from plugin )
    const clientConfig: StrategyOptions = {
      clientID: process.env.NC_OIDC_CLIENT_ID ?? 'dummy-id',
      tokenURL: process.env.NC_OIDC_TOKEN_URL ?? '',
      authorizationURL: process.env.NC_OIDC_AUTH_URL ?? '',
      clientSecret: process.env.NC_OIDC_CLIENT_SECRET ?? 'dummy-secret',
      // todo: update url
      callbackURL: `${
        process.env.NC_OIDC_CALLBACK_HOST ?? 'http://localhost:3000'
      }/dashboard`,
      passReqToCallback: true as false,
      scope: ['openid', 'profile', 'email'],
    };

    return new OIDCStrategy(clientConfig, usersService);
  },
};
